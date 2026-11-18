# Publish Inkspan to npm

GitHub Actions publishes the tarball that passed Inkspan's package and Rust checks. A push of a version tag starts the release. The tag must equal the package version prefixed with `v`. Stable versions use the npm `latest` channel and prereleases use `beta`.

## Set up the publisher

npm requires an existing package to register a trusted publisher. For a new package, a maintainer first publishes the reviewed beta tarball with their own npm login and 2FA. Set `--access public --tag beta` for that first release. Install the workflow on the default branch before registering it.

With npm 11.15 or later and a maintainer account with 2FA, run:

```sh
npm trust github @farming-labs/inkspan --repository farming-labs/inkspan --file publish.yml --allow-publish
npm trust list @farming-labs/inkspan
```

The same settings are available in the package's **Settings → Trusted publishing → GitHub Actions**. Use organization `farming-labs`, repository `inkspan`, workflow filename `publish.yml`, and leave the environment field empty. Register the trust connection close to the next release. npm gives a new connection two days to complete its first successful publish. To disable the connection, use the package settings or `npm trust revoke @farming-labs/inkspan --id <trust-id>`. [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)

## Release a version

Push the matching version tag when the release is ready. For example, a package version of `0.1.0-beta.1` uses `v0.1.0-beta.1`. The workflow runs the existing checks on the tagged revision, downloads the Linux job's tarball from that run, verifies its package name and version, and publishes it with provenance. Only the publish job can request a short-lived OIDC credential. The workflow uses the npm bundled with Node 24.21.0.

A failed publish can be retried from its Actions run after correcting the cause. If npm already accepted the version, verify it with `npm view @farming-labs/inkspan@<version> dist.integrity dist.attestations`.

## Verify the workflow

Lint both workflows, exercise the tarball offline, and rehearse the publish command with `npm publish --dry-run`. Check beta and stable routing and rejection of a mismatched tag. A live registry publish verifies OIDC and provenance on release day.
