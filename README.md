# Assign milestone to pull-requests from label

This javascript action assigns milestones to pull-requests based on the labels
of that pull-request. The action has some assumptions listed below.

## Assumptions

This action assumes that you
1. want to assign the milestones to represent future releases
2. release the software on Github in a linear fashion, i.e. the
   last released version is always the basis for determining the milestone
3. use [semantic versioning](https://semver.org/)
4. milestone titles are just the version e.g. `v1.2.3`
5. milestones you want to assign already exist and are open

## Inputs

### `repo-token` (**required**)

The GITHUB_ACTION token required to assign the milestone to pull-requests.

### `bugfix-labels` (*optional*)

Comma-separated list of pull-request labels to match for targeting a
*bugfix milestone*.

By *default* this option is set to `bug,documentation`.

### `minor-labels` (*optional*)

Comma-separated list of pull-request labels to match for targeting a
*minor milestone*.

By *default* this option is set `enhancement`.

### `major-labels` (*optional*)

Comma-separated list of pull-request labels to match for targeting a
*major milestone*.

By *default* this option is set to `breaking`.

### `fallback` (*optional*)

The fallback target is used if the pull-request labels does not match any of
the above list, e.g. ii is labeled with a custom `dependency` label.
Furthermore, this option takes effect in case the milestone is not found e.g.
if it does not exist.

Valid settings are `bugfix`, `minor`, `major` or leaving the option empty. In
the latter case, unassigned pull-requests are left-as-is.

By *default* this option is set to `minor`.

## Outputs

### `milestone`

The title of the milestone assigned to the pull-request. In case of an error
or in case the action does not apply a `-` is returned.

## Example usage

The below examples assume your latest released version has the title `v1.2.3`.

### Default behavior

When using the default for all optional settings above

```yaml
uses: srebhan/label-milestone-action@v1.0.1
with:
  repo-token: ${{ secrets.GITHUB_TOKEN }}
```

the action will assign all pull-request with a `bug` or `documentation` label to
the *bugfix milestone*, all pull-requests with a `breaking` label to the
*major milestone* and the rest to the *minor milestone*. This is useful if the
majority of your pull-requests are bug-fixes or non-breaking features.

The actual *bugfix*, *minor* and *major milestones* are determined based on the
latest release. For example assuming your latest release is titled `v1.2.3` then
the title of the *bugfix milestone* correspond to `v1.2.4`, the title of the
*minor milestone* corresponds to `v1.3.0` and the title of the
*major milestone* corresponds to `v2.0.0`.

In case the target milestone does not exist, the `fallback` milestone is used.
For example, if the pull-request would be assigned to the *bugfix milestone*
(`v1.2.4` in the example above) does not exist, e.g. because `v1.2.3` was the
last bug-fix release in the `v1.2.x` branch, the pull-request would end up with
the milestone `v1.3.0`.

### No fallback

In case you unset the fallback

```yaml
uses: srebhan/label-milestone-action@v1.0.1
with:
  repo-token: ${{ secrets.GITHUB_TOKEN }}
  fallback: ''
```

and you have a pull-request e.g. labeled `foo` or labels are empty, that
pull-request will not match any of the tag-lists. Without a `fallback` it is
left untouched and will not be assigned to any milestone.

### Minor release preference with custom labels

This example shows a more complex case where the majority of the pull-requests
is assumed to be bug-fixes or non-breaking features and breaking changes might
happen but are seldom. Let's further assume we have introduced some custom
labels mostly corresponding to the
[semantic commit message](https://www.conventionalcommits.org/en/v1.0.0/)
types, i.e. `fix`, `feat`, `chore`, `docs` and `breaking`. Furthermore, we
introduced a `dependencies` label to mark dependency updates. With the
following configuration

```yaml
uses: srebhan/label-milestone-action@v1.0.1
with:
  repo-token: ${{ secrets.GITHUB_TOKEN }}
  bugfix-labels: 'fix,chore,docs,dependencies'
  minor-labels: 'feat'
  major-labels: 'breaking'
  fallback: ''
```

we can sort the pull-requests to the right milestones in case the labels are
set correctly. Please also note that without the `fallback` all pull-requests
not matching any of the above are left untouched and will not be assigned to
any milestone.
