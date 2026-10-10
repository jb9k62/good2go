# Releasing `@jb9k62/good2go`

Releases are published by GitHub Actions (`.github/workflows/release.yml`) with npm trusted
publishing. There is no `NPM_TOKEN` secret. Read [SECURITY.md](../SECURITY.md) for how the
provenance attestation is checked.

## One-off setup

Do this once, before the first automated release.

1. **Account and 2FA.** Sign in to npmjs.com as the owner of the `jb9k62` scope, and enable
   two-factor authentication (Account settings, Two-Factor Authentication, authorisation and
   publishing). npm requires 2FA to publish.
2. **First publish, by hand.** Trusted publishing can only be configured on a package that already
   exists, so the first version goes up from your machine:

   ```sh
   npm login
   npm run build
   npm publish --access public
   ```

   Check the version with `npm view @jb9k62/good2go version` afterwards.
3. **Trusted publisher.** On npmjs.com open the package's **Settings**, then **Trusted Publisher**,
   and choose **GitHub Actions**. Enter:
   - Organisation or user: `jb9k62`
   - Repository: `good2go`
   - Workflow filename: `release.yml`
   - Environment name: `npm`

   The names are case-sensitive, and the workflow filename must match exactly.
4. **GitHub environment.** In the repository, go to **Settings**, then **Environments**, and create
   an environment called `npm`. Add yourself as a required reviewer, so every publish waits for an
   approval. Restrict deployments to tags matching `v*.*.*` if the option is offered.
5. **Lock down token publishing.** On the package's **Settings** page, choose to require two-factor
   authentication and disallow tokens. Once trusted publishing works, no granular or classic token
   needs to exist, so revoke any you created for the first publish.

## Per release

1. Make sure `main` is green in CI and the working tree is clean.
2. Choose the version (semver). Set the same version in these four places:
   - `package.json` (`version`)
   - `.claude-plugin/plugin.json` (`version`)
   - `.claude-plugin/marketplace.json` (`plugins[0].version`)
   - `VERSION` in `src/g2g-init.mts`

   The release workflow fails if they differ from each other or from the tag.
3. In `CHANGELOG.md`, move the entries under `## Unreleased` into a new heading
   `## X.Y.Z - YYYY-MM-DD`, and leave `## Unreleased` empty.
4. Commit the bump on `main` and push it. Let CI finish.
5. Tag the commit and push the tag:

   ```sh
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

6. The `release` workflow runs. The `verify` job runs the checks and the tarball smoke test. Then
   the `publish` job waits for approval in the `npm` environment. Approve it only after `verify`
   has passed.
7. Confirm the release: `npm view @jb9k62/good2go version`, and `npm audit signatures` in a
   scratch project after `npm install @jb9k62/good2go`.

If `verify` fails, delete the tag locally and remotely, fix the problem on `main`, and tag again
under the same version. Nothing has been published, so this is safe:

```sh
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z
```

## Deprecating and unpublishing

npm versions are permanent once published under the same version number. Prefer deprecation.

- **Deprecate** a version (or a range) so installers see a warning. It stays installable:

  ```sh
  npm deprecate @jb9k62/good2go@"1.2.0" "Broken on Node 24.0; use 1.2.1"
  ```

- **Unpublish** only when the content must not be available at all, for example leaked secrets.
  npm allows unpublishing a version within 72 hours of publishing it, and only when no other
  package depends on it. After that, npm asks you to contact support. Then:

  ```sh
  npm unpublish @jb9k62/good2go@1.2.0
  ```

  Unpublishing the whole package blocks its name for a while, so do not do that to fix a bug.
  Publish a fixed patch version instead.

After a bad release, publish a fixed patch version and deprecate the bad one. Mention the fix in
`CHANGELOG.md`.
