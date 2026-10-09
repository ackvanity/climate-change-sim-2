# Development

## Climate change

Required setups:

- Python (for precomputation): Virtual environment, `numpy`, and _HITRAN_
- C++: _WASM_

## Setting up

See each simulation for what they exactly need. Not all dependencies are used on every simulation and some are development-only.

### Python

- Create a virtual environment
- Activate it
- Install core dependencies: `black`

**NOTES**:

1. Kindly format all Python files with `black` before a commit!

#### HITRAN API (HAPI) `hitran-api`

In the working directory of your simulation, make a `config.json` like this:

```json
{
  "engine": "sqlite",
  "database": "local",
  "database_dir": "./",
  "echo": false,
  "debug": false,
  "host": "https://hitran.org",
  "api_version": "v2",
  "api_key": "YOUR_API_KEY_HERE"
}
```

Note that you need to register an account and generate an API key, and that this JSON file must be present where you invoke your scripts. I prefer writing it once on my root directory and copy it to any simulation folder that needs it. The HITRAN API is usually only needed for data generation in Python.
