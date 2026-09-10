// Test scenarios for the action.
//
// Each case describes one pull-request situation and what the action should do
// with it:
//
//   payload         the `github.context.payload` the action is handed
//   inputs          action inputs, merged over the action.yml defaults
//   latestRelease   response for GET /releases/latest (null renders a 404)
//   milestones      response for GET /milestones
//   expect.output   the expected `milestone` action output
//   expect.failed   the action is expected to fail the workflow
//   expect.noPatch  the pull-request must not be modified
//   expect.patchMilestone  the milestone *number* the PR must be assigned to
//   knownIssue      the expectation describes how the action *should* behave,
//                   but currently does not; see README "Known issues".
//                   Reported, but does not fail the suite.

const milestone = (number, title, state = 'open') => ({ number, title, state });

const pullRequest = (labels, extra = {}) => ({
    pull_request: {
        number: 42,
        labels: labels.map((name) => ({ name })),
        ...extra
    }
});

// Applied unless a case overrides them, so the mock repository always looks
// like: latest release v1.2.3, with the three follow-up milestones open.
export const DEFAULT_LATEST_RELEASE = { name: 'v1.2.3' };
export const DEFAULT_MILESTONES = [
    milestone(3, 'v1.2.4'),
    milestone(4, 'v1.3.0'),
    milestone(5, 'v2.0.0')
];

export const cases = [
    // --- event handling ---------------------------------------------------
    {
        name: 'not a pull-request event',
        payload: { push: {} },
        expect: { output: '-', noPatch: true }
    },
    {
        name: 'pull-request already has a milestone',
        payload: pullRequest(['bug'], { milestone: { title: 'v9.9.9' } }),
        expect: { output: '-', noPatch: true }
    },

    // --- label to version mapping -----------------------------------------
    {
        name: 'bug label targets the bugfix milestone',
        payload: pullRequest(['bug']),
        expect: { output: 'v1.2.4', patchMilestone: 3 }
    },
    {
        name: 'documentation label targets the bugfix milestone',
        payload: pullRequest(['documentation']),
        expect: { output: 'v1.2.4', patchMilestone: 3 }
    },
    {
        name: 'enhancement label targets the minor milestone',
        payload: pullRequest(['enhancement']),
        expect: { output: 'v1.3.0', patchMilestone: 4 }
    },
    {
        name: 'breaking label targets the major milestone',
        payload: pullRequest(['breaking']),
        expect: { output: 'v2.0.0', patchMilestone: 5 }
    },
    {
        name: 'bugfix takes precedence over major when both labels are set',
        payload: pullRequest(['breaking', 'bug']),
        expect: { output: 'v1.2.4', patchMilestone: 3 }
    },
    {
        name: 'custom label lists are honoured',
        payload: pullRequest(['type/feature']),
        inputs: { 'minor-labels': 'type/feature', 'bugfix-labels': 'type/fix' },
        expect: { output: 'v1.3.0', patchMilestone: 4 }
    },
    {
        name: 'label list written with spaces after the commas',
        payload: pullRequest(['documentation']),
        inputs: { 'bugfix-labels': 'bug, documentation' },
        expect: { output: 'v1.2.4', patchMilestone: 3 }
    },

    // --- fallback ----------------------------------------------------------
    {
        name: 'unmatched label falls back to minor',
        payload: pullRequest(['question']),
        expect: { output: 'v1.3.0', patchMilestone: 4 }
    },
    {
        name: 'pull-request without labels falls back to minor',
        payload: pullRequest([]),
        expect: { output: 'v1.3.0', patchMilestone: 4 }
    },
    {
        name: 'unmatched label with the fallback disabled is a no-op',
        payload: pullRequest(['question']),
        inputs: { fallback: '' },
        expect: { output: '-', noPatch: true }
    },
    {
        name: 'missing bugfix milestone falls back to the minor milestone',
        payload: pullRequest(['bug']),
        milestones: [milestone(4, 'v1.3.0')],
        expect: { output: 'v1.3.0', patchMilestone: 4 }
    },
    {
        name: 'invalid fallback value fails without touching the pull-request',
        payload: pullRequest(['bug']),
        inputs: { fallback: 'nonsense' },
        expect: { failed: true, noPatch: true },
        knownIssue: 'setFailed() does not return, so the pull-request is still assigned a milestone'
    },

    // --- milestone lookup --------------------------------------------------
    {
        name: 'no matching milestone and no fallback milestone is a no-op',
        payload: pullRequest(['bug']),
        milestones: [milestone(9, 'v7.0.0')],
        expect: { output: '-', noPatch: true }
    },
    {
        name: 'project without any milestones is a no-op',
        payload: pullRequest(['bug']),
        milestones: [],
        expect: { output: '-', noPatch: true }
    },
    {
        name: 'closed milestones are not assigned',
        payload: pullRequest(['bug']),
        milestones: [milestone(3, 'v1.2.4', 'closed')],
        expect: { output: '-', noPatch: true }
    },
    {
        name: 'ambiguous milestone titles fail without touching the pull-request',
        payload: pullRequest(['bug']),
        milestones: [milestone(3, 'v1.2.4'), milestone(8, 'v1.2.4')],
        expect: { failed: true, noPatch: true },
        knownIssue: 'setFailed() does not return, so one of the ambiguous milestones is still assigned'
    },

    // --- release / version parsing -----------------------------------------
    {
        name: 'release name without a v prefix',
        payload: pullRequest(['bug']),
        latestRelease: { name: '1.2.3' },
        expect: { output: 'v1.2.4', patchMilestone: 3 }
    },
    {
        name: 'release with an empty name is a no-op',
        payload: pullRequest(['bug']),
        latestRelease: { name: '' },
        expect: { output: '-', noPatch: true }
    },
    {
        name: 'release without a name (tag-only release) is a no-op',
        payload: pullRequest(['bug']),
        latestRelease: { name: null, tag_name: 'v1.2.3' },
        expect: { output: '-', noPatch: true },
        knownIssue: 'the guard only compares against "", so a null name throws a TypeError'
    },
    {
        name: 'release with a non-semver name is a no-op',
        payload: pullRequest(['bug']),
        latestRelease: { name: 'Release 1.2.3', tag_name: 'v1.2.3' },
        expect: { output: '-', noPatch: true }
    },
    {
        name: 'release name with only two components is a no-op',
        payload: pullRequest(['bug']),
        latestRelease: { name: 'v1.2' },
        expect: { output: '-', noPatch: true },
        knownIssue: 'the bumped version becomes v1.2.NaN, so the fallback silently assigns the minor milestone'
    },
    {
        name: 'repository without any release',
        payload: pullRequest(['bug']),
        latestRelease: null,
        expect: { failed: true, noPatch: true }
    }
];
