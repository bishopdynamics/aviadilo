# TODO List

This is the user-maintained TODO list; the only change the agent makes here is marking something done when it is. The user takes care of pruning completed items.

Items the agent deliberately deferred during implementation go to `docs/DEFERRED.md` instead; pull one in here when it's time to actually do it.

## Small Things

Little tweaks that do not warrant the full feature spec lifecycle.
If something here is actually bigger than it looks and really should be spec'd first, call that out and it goes through the full feature spec lifecycle (see Features below).

- 

## Features

A feature must first be planned (user idea → research and discuss → improved idea → full feature spec), producing a spec file `docs/spec/FEATURE_SPEC_<thing>.md`. Then it can be implemented, following the spec.

- [x] Review and improve map tile streaming
  - tiles sometimes load slowly, and sometimes some tiles fail to load at all
  - if i open the console, i see lots of 429, presumably thats from our own integration
  - can we more agressively cache tiles client-side?
  - can we adjust the rate limiting, or is that part of something that HA provides?
  - 