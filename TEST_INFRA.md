# E2E Test Infra: OneShotForge

## Test Philosophy

- **Opaque-box**: The test suite validates the system's externally observable behaviors (filesystem structure and HTTP APIs) without relying on internal framework implementations.
- **Requirement-driven**: Mapped directly to requirements in `ORIGINAL_REQUEST.md`.
- **Methodology**: Category-Partition for feature paths, Boundary Value Analysis (BVA) for limits and error states, Pairwise Testing for cross-feature interactions, and Real-World Workload Testing for developer workflows.

## Feature Inventory

| #   | Feature              | Source (requirement) | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Cross-Feature) | Tier 4 (Real-World) |
| --- | -------------------- | -------------------- | :---------------: | :---------------: | :--------------------: | :-----------------: |
| 1   | Monorepo Structure   | ORIGINAL_REQUEST §R1 |      5 tests      |      5 tests      |           ✓            |          ✓          |
| 2   | Notion Scraper       | ORIGINAL_REQUEST §R3 |      5 tests      |      5 tests      |           ✓            |          ✓          |
| 3   | Dashboard API Scan   | ORIGINAL_REQUEST §R2 |      5 tests      |      5 tests      |           ✓            |          ✓          |
| 4   | Dashboard API Run    | ORIGINAL_REQUEST §R2 |      5 tests      |      5 tests      |           ✓            |          ✓          |
| 5   | Dashboard UI Listing | ORIGINAL_REQUEST §R2 |      5 tests      |      5 tests      |           ✓            |          ✓          |
| 6   | Dashboard UI Filter  | ORIGINAL_REQUEST §R2 |      5 tests      |      5 tests      |           ✓            |          ✓          |
| 7   | Dashboard UI Preview | ORIGINAL_REQUEST §R2 |      5 tests      |      5 tests      |           ✓            |          ✓          |
| 8   | Dashboard UI Actions | ORIGINAL_REQUEST §R2 |      5 tests      |      5 tests      |           ✓            |          ✓          |
| 9   | Manifest API         | M3 Requirement       |      5 tests      |      5 tests      |           ✓            |          ✓          |
| 10  | Manifest Verify      | M3 Requirement       |      5 tests      |      2 tests      |           ✓            |          ✓          |
| 11  | Full Lifecycle       | M3 Requirement       |      1 test       |      0 tests      |           ✓            |          ✓          |
| 12  | Ideas Registry       | M4 Requirement       |      5 tests      |      5 tests      |           ✓            |          ✓          |

## Test Architecture

- **Test Runner**: A custom, zero-dependency BDD test runner located at `tests/e2e/runner.js`.
  - Exposes global hooks (`describe`, `test`/`it`, `beforeAll`/`afterAll`, `beforeEach`/`afterEach`) and assertions (`expect()`).
  - Scans for `*.test.js` files recursively in `tests/e2e/cases/` and runs them sequentially.
  - Automatically traps uncaught exceptions/rejections, generates JUnit XML reports, and returns exit code 0 on success, 1 on failure.
- **Test Configuration**: Target endpoint defaults to `http://localhost:3000` but can be configured using `DASHBOARD_URL`.
- **Directory Layout**:
  - `tests/e2e/runner.js` - Runner entrypoint
  - `tests/e2e/verify.js` - Verification mock server and execution verification utility
  - `tests/e2e/cases/` - Individual test suite files
  - `tests/e2e/reports/` - Output directory for JUnit XML results

## Real-World Application Scenarios (Tier 4)

| #   | Scenario                           | Features Exercised     | Complexity |
| --- | ---------------------------------- | ---------------------- | ---------- |
| 1   | Developer Onboarding Journey       | F1, F2, F3, F5, F7, F8 | High       |
| 2   | Code Correction & Re-run Cycle     | F3, F4, F8             | High       |
| 3   | Standalone Scraper Extraction      | F2, F8                 | High       |
| 4   | Monorepo Scaling Scan Load         | F3                     | Medium     |
| 5   | Security Sandbox & Execution Traps | F4                     | High       |

## Coverage Thresholds

- **Tier 1 (Feature Coverage)**: ≥5 tests per feature (Total: 45 tests)
- **Tier 2 (Boundary & Edge Cases)**: ≥5 tests per feature (Total: 45 tests)
- **Tier 3 (Cross-Feature Combinations)**: Pairwise coverage of major features (Total: 10 tests)
- **Tier 4 (Real-World Scenarios)**: Real developer and user lifecycles (Total: 10 tests)
- **Total Minimum Threshold**: ~11 \* 8 + max(5, 4) = 93 tests. Actual implemented: **110 tests** (and 134 total test assertions in the active test runner).
