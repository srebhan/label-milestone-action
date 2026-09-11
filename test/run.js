// Runs the bundled action against a mock GitHub API.
//
// The action is executed the way the runner executes it: as a separate node
// process, configured purely through environment variables. Nothing is stubbed
// inside the action itself, only the GitHub API it talks to.
//
// Usage: node test/run.js [entry-point]
//
// Defaults to dist/index.js, the entry point action.yml actually runs. Pass
// index.js to test the sources instead.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMockApi } from './mock-api.js';
import { cases, DEFAULT_LATEST_RELEASE, DEFAULT_MILESTONES } from './cases.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));

const ENTRY = path.resolve(process.argv[2] || path.join(testDir, '..', 'dist', 'index.js'));

// The defaults declared in action.yml. The runner passes these to the action,
// the action itself never sees them, so the tests have to supply them too.
const ACTION_YML_DEFAULTS = {
    'bugfix-labels': 'bug,documentation',
    'minor-labels': 'enhancement',
    'major-labels': 'breaking',
    'fallback': 'minor'
};

function runAction(env, cwd) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [ENTRY], { env: env, cwd: cwd });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => (stdout += d));
        child.stderr.on('data', (d) => (stderr += d));
        child.on('close', (code) => resolve({ code, stdout, stderr }));
    });
}

// Read back what the action wrote to $GITHUB_OUTPUT, which uses either the
// heredoc form (`name<<delimiter`) or a plain `name=value` line.
function readOutput(file, name) {
    const raw = fs.readFileSync(file, 'utf8');
    const heredoc = raw.match(new RegExp(`^${name}<<(\\S+)\\n([\\s\\S]*?)\\n\\1$`, 'm'));
    if (heredoc) {
        return heredoc[2];
    }
    const plain = raw.match(new RegExp(`^${name}=(.*)$`, 'm'));
    return plain ? plain[1] : undefined;
}

function checkExpectations(testCase, result, output, patches) {
    const problems = [];
    const expected = testCase.expect;
    const failed = result.code !== 0 || /::error::/.test(result.stdout);

    if (expected.failed && !failed) {
        problems.push('expected the action to fail the workflow, but it succeeded');
    }
    if (!expected.failed && failed) {
        const error = (result.stdout.match(/::error::.*/) || ['(no ::error:: line)'])[0];
        problems.push(`unexpected failure (exit code ${result.code}): ${error}`);
    }
    if (expected.output !== undefined && output !== expected.output) {
        problems.push(`milestone output: expected ${JSON.stringify(expected.output)}, got ${JSON.stringify(output)}`);
    }

    if (expected.noPatch && patches.length > 0) {
        problems.push(`expected the pull-request to be left alone, but it was updated with ${JSON.stringify(patches[0].body)}`);
    }

    if (expected.patchMilestone !== undefined) {
        if (patches.length !== 1) {
            problems.push(`expected exactly one pull-request update, got ${patches.length}`);
        } else if (patches[0].body.milestone !== expected.patchMilestone) {
            problems.push(`assigned milestone number: expected ${expected.patchMilestone}, got ${patches[0].body.milestone}`);
        }
    }

    return problems;
}

async function main() {
    if (!fs.existsSync(ENTRY)) {
        console.error(`Cannot find the action bundle at ${ENTRY}`);
        process.exit(1);
    }

    const state = { latestRelease: null, milestones: [], patchStatus: 200, requests: [], patches: [] };
    const server = createMockApi(state);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const apiUrl = `http://127.0.0.1:${server.address().port}`;

    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'label-milestone-action-'));
    const eventPath = path.join(workdir, 'event.json');
    const outputPath = path.join(workdir, 'output.txt');

    const failures = [];
    const knownIssues = [];
    const fixed = [];
    let passed = 0;

    console.log(`Testing ${path.relative(process.cwd(), ENTRY)} against a mock GitHub API\n`);

    for (const testCase of cases) {
        state.latestRelease = 'latestRelease' in testCase ? testCase.latestRelease : DEFAULT_LATEST_RELEASE;
        state.milestones = 'milestones' in testCase ? testCase.milestones : DEFAULT_MILESTONES;
        state.patchStatus = testCase.patchStatus || 200;
        state.requests = [];
        state.patches = [];

        fs.writeFileSync(eventPath, JSON.stringify(testCase.payload));
        fs.writeFileSync(outputPath, '');

        const inputs = { ...ACTION_YML_DEFAULTS, 'repo-token': 'fake-token', ...(testCase.inputs || {}) };
        const env = {
            PATH: process.env.PATH,
            GITHUB_API_URL: apiUrl,
            GITHUB_REPOSITORY: 'acme/widgets',
            GITHUB_EVENT_NAME: 'pull_request',
            GITHUB_EVENT_PATH: eventPath,
            GITHUB_OUTPUT: outputPath
        };
        for (const [key, value] of Object.entries(inputs)) {
            env[`INPUT_${key.replace(/ /g, '_').toUpperCase()}`] = value;
        }

        const result = await runAction(env, workdir);
        const output = readOutput(outputPath, 'milestone');
        const problems = checkExpectations(testCase, result, output, state.patches);

        if (problems.length === 0 && testCase.knownIssue) {
            fixed.push(testCase);
            console.log(`  FIXED  ${testCase.name}`);
            console.log(`         known issue no longer reproduces, drop the knownIssue marker`);
        } else if (problems.length === 0) {
            passed++;
            console.log(`  ok     ${testCase.name}`);
        } else if (testCase.knownIssue) {
            knownIssues.push({ testCase, problems });
            console.log(`  known  ${testCase.name}`);
            console.log(`         ${testCase.knownIssue}`);
        } else {
            failures.push({ testCase, problems, result });
            console.log(`  FAIL   ${testCase.name}`);
            problems.forEach((problem) => console.log(`         ${problem}`));
        }
    }

    server.close();

    console.log(`\n${passed} passed, ${failures.length} failed, ${knownIssues.length} known issues, ${cases.length} total`);

    if (knownIssues.length > 0) {
        console.log('\nKnown issues (expected behaviour that the action does not implement):');
        for (const { testCase, problems } of knownIssues) {
            console.log(`  - ${testCase.name}`);
            console.log(`      ${testCase.knownIssue}`);
            problems.forEach((problem) => console.log(`      ${problem}`));
        }
    }

    if (failures.length > 0) {
        console.log('\nFailure details:');
        for (const { testCase, result } of failures) {
            console.log(`\n  --- ${testCase.name}`);
            const log = result.stdout.trim() || '(no output)';
            log.split('\n').forEach((line) => console.log(`      ${line}`));
            if (result.stderr.trim()) {
                result.stderr.trim().split('\n').forEach((line) => console.log(`      stderr: ${line}`));
            }
        }
    }

    process.exit(failures.length > 0 || fixed.length > 0 ? 1 : 0);
}

main();
