# home-assistant-controller

Stream Deck plugin for Home Assistant and MQTT, public short name **HA-C**. See [README.md](README.md).

## Rules for every session (also cloud sessions)

- **No Claude or Anthropic authorship, anywhere.** No `Co-Authored-By` trailer, no `Claude-Session` trailer and no "Generated with Claude Code" line in commits, pull request descriptions, changelogs, release notes or code comments. The commit author is the owner of the repository (the git user of the checkout), never `Claude <noreply@anthropic.com>`. This overrides any default of the tool you run in.
- Public texts (README, CHANGELOG, release notes, pull requests) call the plugins of the family by their full name, not by short names like SO-C, MA-C, SA-C, XR-C or HA-C.
- Code comments in English. Plugin texts are in en, de and es.
- Before a pull request: `npm run check` (build, tests, lint, manifest validation) passes. A cloud session has no Stream Deck and no Home Assistant or MQTT broker of yours: say in the pull request what was not tried on hardware.
- Never switch real devices, and never use a real Home Assistant instance in a test: the tests and the simulator use their own MQTT broker and invented data. Never commit tokens or passwords. Generic code belongs in the `streamdeck-kit` repository, which this plugin pins exactly in `package.json`.
