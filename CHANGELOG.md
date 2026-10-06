# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.54.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.53.0...v1.54.0) (2026-10-06)

## [1.53.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.52.0...v1.53.0) (2026-10-06)

## [1.52.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.51.0...v1.52.0) (2026-10-05)


### Bug Fixes

* **dashboard:** tagline "Manage your Squeezebox players." ([e5aed0b](https://github.com/onmomo/squeeze-plex-hub/commit/e5aed0bff565acf6d171acb2b691bde7dc63ee2d))

## [1.51.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.50.0...v1.51.0) (2026-10-04)


### Features

* **dashboard:** ⇄ next to Stereo pair in the card title ([#118](https://github.com/onmomo/squeeze-plex-hub/issues/118)) ([4d31870](https://github.com/onmomo/squeeze-plex-hub/commit/4d3187003b72c906ae3710c5f97c5dbe3e955fe4))
* **dashboard:** create and dissolve stereo pairs ([#117](https://github.com/onmomo/squeeze-plex-hub/issues/117)) ([6065c30](https://github.com/onmomo/squeeze-plex-hub/commit/6065c3009eb1cb09f88932d0f61185ce9661dd15))
* **dashboard:** pick player images like Lyrion, Softsqueeze for Squeezelite ([#118](https://github.com/onmomo/squeeze-plex-hub/issues/118)) ([fa939ed](https://github.com/onmomo/squeeze-plex-hub/commit/fa939ed83ee1b303941fa5e9632685515cb1cd82))
* **dashboard:** star marks the main player of a stereo pair ([#118](https://github.com/onmomo/squeeze-plex-hub/issues/118)) ([6c01341](https://github.com/onmomo/squeeze-plex-hub/commit/6c013416a0c3e7d7653b66dd22b25ed38e130c03))
* **stereo-pair:** link volumes, ⇄ names, amber pair card ([#118](https://github.com/onmomo/squeeze-plex-hub/issues/118)) ([995527c](https://github.com/onmomo/squeeze-plex-hub/commit/995527cabd1c798ae85ab30c373e0d82e1089d1b))
* **stereo-pair:** mark pairs with ⇄ in Plexamp and on the dashboard ([#118](https://github.com/onmomo/squeeze-plex-hub/issues/118)) ([643ba66](https://github.com/onmomo/squeeze-plex-hub/commit/643ba66695dca5634b9eb84506e48b4fa47b6370))
* **stereo-pair:** restore pairs in the scanner and only pair capable players ([#117](https://github.com/onmomo/squeeze-plex-hub/issues/117)) ([e071e3c](https://github.com/onmomo/squeeze-plex-hub/commit/e071e3c1fa2c6e32fe616613623c339644143c4e))
* **stereo-pair:** sync two players as left/right stereo pair ([#117](https://github.com/onmomo/squeeze-plex-hub/issues/117)) ([3da5880](https://github.com/onmomo/squeeze-plex-hub/commit/3da5880266aa955bc527004a88add5f72ad11b4c))


### Bug Fixes

* **stereo-pair:** dissolve keeps the left player playing and resets members that were not connected ([#118](https://github.com/onmomo/squeeze-plex-hub/issues/118)) ([49cf265](https://github.com/onmomo/squeeze-plex-hub/commit/49cf26511e9d8e0107b347193b1c3dc370f8471f))
* **stereo-pair:** header-safe device names, debounce offline readings ([#118](https://github.com/onmomo/squeeze-plex-hub/issues/118)) ([b86df98](https://github.com/onmomo/squeeze-plex-hub/commit/b86df98a4b6d3f9f90d2d8f6a16694955a884623))
* **stereo-pair:** keep playing when a pair is formed while the main player plays ([#118](https://github.com/onmomo/squeeze-plex-hub/issues/118)) ([0ce14cf](https://github.com/onmomo/squeeze-plex-hub/commit/0ce14cf62e19cd79945db9b62336fd7fd0db1671))
* **stereo-pair:** pending resets respect the pair lock, re-probe negative capabilities ([#118](https://github.com/onmomo/squeeze-plex-hub/issues/118)) ([5a1ce43](https://github.com/onmomo/squeeze-plex-hub/commit/5a1ce43cf2497268c4053b5776ece26452d68316))
* **stereo-pair:** review comments ([#118](https://github.com/onmomo/squeeze-plex-hub/issues/118)) ([dcebf4a](https://github.com/onmomo/squeeze-plex-hub/commit/dcebf4a84faab6764a5db09642ad0b0eef86be34))
* **stereo-pair:** review findings ([#118](https://github.com/onmomo/squeeze-plex-hub/issues/118)) ([133f7d0](https://github.com/onmomo/squeeze-plex-hub/commit/133f7d06426eaed28c32563561883ebb9740b0e5))

## [1.50.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.49.0...v1.50.0) (2026-10-03)


### Features

* **dashboard:** hide players from Plexamp, persist settings and redesign dashboard ([4182dfd](https://github.com/onmomo/squeeze-plex-hub/commit/4182dfd0d955bdbb715a0a4450776308a5b5ceba)), closes [#109](https://github.com/onmomo/squeeze-plex-hub/issues/109)


### Bug Fixes

* **dashboard:** align header readout, clearer hidden player copy ([bb47cf9](https://github.com/onmomo/squeeze-plex-hub/commit/bb47cf9c55a2ada617e999c33e2659972b37d7e6))
* **dashboard:** color mode button top right on phones ([546d062](https://github.com/onmomo/squeeze-plex-hub/commit/546d0621ec1b86d954541a9056c0e8c0bd9b1030))
* **dashboard:** key label and plate spacing polish ([5424fed](https://github.com/onmomo/squeeze-plex-hub/commit/5424fed5b05e6be28ecf8943ef78b009655803dd))
* **dashboard:** mount player modules in a recessed bay of their LMS plate ([46a39f1](https://github.com/onmomo/squeeze-plex-hub/commit/46a39f1f0cd21c27b0be776b828842f23f6bea6d))
* **dashboard:** single undo message, color mode top right on all widths ([bb16a7b](https://github.com/onmomo/squeeze-plex-hub/commit/bb16a7bb50e7fdf0cd28fdb45f286a31ab61d3e4))

## [1.49.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.48.0...v1.49.0) (2026-10-03)


### Bug Fixes

* **deps:** patch high-severity transitive vulnerabilities via resolutions ([3e8a69b](https://github.com/onmomo/squeeze-plex-hub/commit/3e8a69b36e6bfa9384735c9403eb5e2af910aaac))

## [1.48.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.47.0...v1.48.0) (2026-10-03)


### Bug Fixes

* **deps:** align @vitest/coverage-v8 and @nuxt/test-utils with vitest 5 ([be3c073](https://github.com/onmomo/squeeze-plex-hub/commit/be3c073bc5c92f732e98a289471a16eedbe2a9ca))

## [1.47.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.46.0...v1.47.0) (2026-10-03)

## [1.46.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.45.0...v1.46.0) (2026-10-03)

## [1.45.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.44.0...v1.45.0) (2026-10-03)


### Bug Fixes

* **playback:** start album play queue at the selected track ([#106](https://github.com/onmomo/squeeze-plex-hub/issues/106)) ([c701456](https://github.com/onmomo/squeeze-plex-hub/commit/c70145669957e9559af9273e4a5aca57de0deba1))

## [1.44.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.43.0...v1.44.0) (2026-10-03)

## [1.43.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.42.0...v1.43.0) (2026-08-18)


### Bug Fixes

* support multiple Plex servers in GDM discovery without crashing ([dbdadf4](https://github.com/onmomo/squeeze-plex-hub/commit/dbdadf4c979edcb2f92f8734bf32e6d98a30842a)), closes [#101](https://github.com/onmomo/squeeze-plex-hub/issues/101)
* use trailing-slash prefix for plexServers getKeys, per review ([d974407](https://github.com/onmomo/squeeze-plex-hub/commit/d9744079d5c648fe752b76ce7b8203055012c8b3))

## [1.42.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.41.0...v1.42.0) (2026-08-15)

## [1.41.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.40.0...v1.41.0) (2026-08-15)


### Bug Fixes

* replace nuxt:replace rolldown plugin with @rollup/plugin-replace for vitest compatibility ([61b28af](https://github.com/onmomo/squeeze-plex-hub/commit/61b28afa1b6c32c996055798672598840d89ad33))
* upgrade to @nuxt/test-utils@4.x + vitest@4.x; remove rolldown workaround ([5b2ffb9](https://github.com/onmomo/squeeze-plex-hub/commit/5b2ffb917cf58c79fdb5893c5af622e66de17ac9))

## [1.40.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.39.0...v1.40.0) (2026-08-14)

## [1.39.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.38.0...v1.39.0) (2026-07-01)


### Bug Fixes

* resolve TypeScript errors from noUncheckedIndexedAccess enabled by Nuxt 4.4.6 ([e9f40e1](https://github.com/onmomo/squeeze-plex-hub/commit/e9f40e1e2c9594d94eaed7a4c051bf94bed60668))

## [1.38.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.37.0...v1.38.0) (2026-05-22)

## [1.37.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.36.0...v1.37.0) (2026-04-13)

## [1.36.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.35.0...v1.36.0) (2026-03-26)

## [1.35.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.34.0...v1.35.0) (2026-03-20)

## [1.34.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.33.0...v1.34.0) (2026-03-17)

## [1.33.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.32.0...v1.33.0) (2026-03-05)


### Bug Fixes

* reduce log noise ([f05bdac](https://github.com/onmomo/squeeze-plex-hub/commit/f05bdac930c3b439d782ebb9d745cf0f112d456b))

## [1.32.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.31.0...v1.32.0) (2026-03-05)

## [1.31.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.30.0...v1.31.0) (2026-03-05)

## [1.30.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.29.0...v1.30.0) (2026-03-05)

## [1.29.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.28.0...v1.29.0) (2026-03-01)

## [1.28.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.27.0...v1.28.0) (2026-02-26)

## [1.27.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.26.0...v1.27.0) (2026-02-13)


### Bug Fixes

* improve UDP port binding logic and add error handling for blocked ports ([78d9f2a](https://github.com/onmomo/squeeze-plex-hub/commit/78d9f2a443ea0278882942168a2ecaece6f55355))
* update UDP port binding and improve logging for GDM discovery ([1efd2a0](https://github.com/onmomo/squeeze-plex-hub/commit/1efd2a01dade31cb6f760d7b3d8804f14b7e77d2))

## [1.26.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.25.0...v1.26.0) (2026-02-11)

## [1.25.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.24.0...v1.25.0) (2026-01-25)

## [1.24.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.23.0...v1.24.0) (2026-01-25)

## [1.23.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.22.0...v1.23.0) (2026-01-21)

## [1.22.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.21.0...v1.22.0) (2026-01-21)

## [1.21.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.20.0...v1.21.0) (2026-01-19)

## [1.20.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.19.0...v1.20.0) (2026-01-19)

## [1.19.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.18.0...v1.19.0) (2026-01-18)

## [1.18.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.17.0...v1.18.0) (2025-12-13)

## [1.17.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.16.0...v1.17.0) (2025-12-13)

## [1.16.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.15.0...v1.16.0) (2025-11-18)

## [1.15.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.14.0...v1.15.0) (2025-11-06)

## [1.14.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.13.0...v1.14.0) (2025-11-01)

## [1.13.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.12.0...v1.13.0) (2025-10-30)

## [1.12.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.11.0...v1.12.0) (2025-10-27)


### Features

* add deleteFromPlaylist method and enhance playQueue refresh logging ([a01a8fd](https://github.com/onmomo/squeeze-plex-hub/commit/a01a8fd94d6bb82a24481cf4b572df6e8b491436))
* enhance playQueueRefresher to support forced refresh when selecting items or skipping forward ([4c9f731](https://github.com/onmomo/squeeze-plex-hub/commit/4c9f7316e8b261a07a725d924b488bc30b295cbc))
* enhance playQueueRefresher to support player-specific refresh and improve playQueue playback handling ([a902d77](https://github.com/onmomo/squeeze-plex-hub/commit/a902d7721e353477e12d7d3f58addbb59b6c72f8))
* run playQueueRefresher when a track ends to ensure playList is always up to date ([49243a6](https://github.com/onmomo/squeeze-plex-hub/commit/49243a6512bb7f615c3317e2cf8a208f794423e0))

## [1.11.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.10.0...v1.11.0) (2025-10-15)


### Features

* add repeat and shuffle parameters to player status and implement repeat functionality ([3e70e9f](https://github.com/onmomo/squeeze-plex-hub/commit/3e70e9f97017061c56f1f6c213a2c4f305da8108))

## [1.10.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.9.0...v1.10.0) (2025-10-15)


### Features

* add playQueue refresh logic before skipping tracks in playback routes ([b9bf600](https://github.com/onmomo/squeeze-plex-hub/commit/b9bf6006289da479bf722bd145765f86a6b5095e))
* add playQueueRefresher task for automatic playQueue refresh ([9c6b33b](https://github.com/onmomo/squeeze-plex-hub/commit/9c6b33bdf1318c5526abb98ebffb32f0045003f0))

## [1.9.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.8.0...v1.9.0) (2025-10-13)


### Features

* support refresh playQueue functionality ([f2b40ea](https://github.com/onmomo/squeeze-plex-hub/commit/f2b40ea4f29f3cccfd0b287b3f1036fb60a61819))

## [1.8.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.7.0...v1.8.0) (2025-10-11)

## [1.7.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.6.0...v1.7.0) (2025-10-11)

## [1.6.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.5.0...v1.6.0) (2025-10-05)


### Features

* describe UDP port 32412 for discovery requests from Plex clients ([cfeaa18](https://github.com/onmomo/squeeze-plex-hub/commit/cfeaa18cbe7b4940d2e2a6da67fbdd15d0bd842b))
* display player ID in the discovered devices list ([f4b25ea](https://github.com/onmomo/squeeze-plex-hub/commit/f4b25ea56dbd5f5c834f36ff0e6520c596e2ed57))

## [1.5.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.4.0...v1.5.0) (2025-09-30)

## [1.4.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.3.0...v1.4.0) (2025-09-29)


### Features

* extract APP_VERSION from package.json for Docker image build ([98b4c65](https://github.com/onmomo/squeeze-plex-hub/commit/98b4c653846214f9302b881776e112a3225fac6e))

## [1.3.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.2.0...v1.3.0) (2025-09-29)


### Features

* add Docker Buildx setup to CI workflow ([2c0d55a](https://github.com/onmomo/squeeze-plex-hub/commit/2c0d55a62db0390ecfd1e4461f3b1f0a4d1fbc6e))
* enhance CI workflows with multi-platform Docker image build and update changelog ([965533e](https://github.com/onmomo/squeeze-plex-hub/commit/965533e9c32855370c51d59791234b7c10527eaa))
* only build amd64 for pull requests ([46a6ef6](https://github.com/onmomo/squeeze-plex-hub/commit/46a6ef6f21662f237a7efbc39482c6ffab47c058))
* update Docker Buildx setup for multi-platform image builds in CI workflows with cache ([f88764e](https://github.com/onmomo/squeeze-plex-hub/commit/f88764e65a8403a2bd4f1d7500e2c77c6bd4b1c5))

## [1.2.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.1.0...v1.2.0) (2025-09-29)


### Bug Fixes

* update Docker image publish workflow to correctly reference APP_VERSION and improve package.json description ([1128f7c](https://github.com/onmomo/squeeze-plex-hub/commit/1128f7ccf8a871230af5690fde6370842058f620))

## [1.2.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.1.0...v1.2.0) (2025-09-29)

* app version handling ([53399e7](https://github.com/onmomo/squeeze-plex-hub/commit/53399e7b21e5526907f1eae8cf43824d458b9f40))

## [1.1.0](https://github.com/onmomo/squeeze-plex-hub/compare/v1.0.0...v1.1.0) (2025-09-29)