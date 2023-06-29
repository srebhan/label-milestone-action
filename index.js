const core = require('@actions/core');
const github = require('@actions/github');

// most @actions toolkit packages have async methods
async function run() {
    try {
        // Get the configuration options
        const bugfix = core.getInput('bugfix-tags');
        const minor = core.getInput('minor-tags');
        const major = core.getInput('major-tags');

        // Get the JSON webhook payload for the event that triggered the workflow
        const ctx = JSON.stringify(github.context.payload, undefined, 2)
        ccore.debug(`The event context: ${ctx}`);
        const payload = JSON.stringify(github.context.payload, undefined, 2)
        core.debug(`The event payload: ${payload}`);

        var milestone = ""
        core.setOutput('milestone', milestone);
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();