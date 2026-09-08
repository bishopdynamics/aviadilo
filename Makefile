.DEFAULT_GOAL := help
UV ?= uv
NPM ?= npm

.PHONY: help setup run build test check lint format clean e2e ha-prepare ha-dev
help: ## List development commands
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "%-12s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: ## Install locked dependencies using pinned Node and Python
	@node -e 'if (process.versions.node !== require("fs").readFileSync(".node-version", "utf8").trim()) throw Error("Use Node from .node-version")'
	$(NPM) ci --include=dev --ignore-scripts --no-audit --no-fund
	$(UV) sync --locked
	$(NPM) run validators:generate

run: ## Serve the offline synthetic fixture harness locally
	$(NPM) run dev

build: ## Build card, offline harness and deterministic HACS ZIP
	$(NPM) run build
	$(UV) run --frozen python scripts/build_release.py
	$(UV) run --frozen python scripts/check_release.py dist/aviadilo.zip

test: ## Run shared-contract and packaging regression tests
	$(NPM) test
	$(UV) run --frozen pytest

lint: ## Check formatting, lint and static types in both languages
	$(NPM) run format:check
	$(NPM) run lint
	$(NPM) run typecheck
	$(UV) run --frozen ruff format --check .
	$(UV) run --frozen ruff check .
	$(UV) run --frozen mypy

check: lint test build e2e ## Run CI gates including offline Chromium acceptance

format: ## Format frontend/contracts and Python source
	$(NPM) run format
	$(UV) run --frozen ruff format .

clean: ## Remove generated build artifacts only
	$(UV) run --frozen python -c 'from pathlib import Path; import shutil; [shutil.rmtree(p) for p in (Path("dist"), Path("custom_components/aviadilo/frontend")) if p.is_dir()]'

e2e: ## Exercise the composed card in Chromium with offline fixtures
	$(NPM) run e2e

ha-prepare: ## Prepare an isolated synthetic Home Assistant instance in /tmp
	$(UV) run --frozen python dev/ha/manage.py prepare --fixtures

ha-dev: ## Run the isolated Home Assistant instance on localhost:18123
	$(UV) run --frozen python dev/ha/manage.py run
