.PHONY: install lint format test docker run

install:
	pip install -e ".[dev]"
	pre-commit install || true

lint:
	ruff check .
	ruff format --check .

format:
	ruff check --fix .
	ruff format .

test:
	pytest --cov=aeromro --cov-report=term-missing

docker:
	docker build -t aeromro:local .

run:
	python -m aeromro
