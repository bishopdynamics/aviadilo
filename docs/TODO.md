# TODO List

This is the user-maintained TODO list; the only change the agent makes here is marking something done when it is. The user takes care of pruning completed items.

Items the agent deliberately deferred during implementation go to `docs/DEFERRED.md` instead; pull one in here when it's time to actually do it.

## Small Things

Little tweaks that do not warrant the full feature spec lifecycle.
If something here is actually bigger than it looks and really should be spec'd first, call that out and it goes through the full feature spec lifecycle (see Features below).

- [x] want an auto-fit option, to zoom out in order to fit the tracked people/devices
  - this is the payoff of the only-show-people-within-radius feature, because we can auto-fit to only the filtered users


## Features

A feature must first be planned (user idea → research and discuss → improved idea → full feature spec), producing a spec file `docs/spec/FEATURE_SPEC_<thing>.md`. Then it can be implemented, following the spec.

- [x] for person icons and the you-are-here icon, there is a common problem of them overlapping when multiple people are at one location
  - can we come up with an icon grouping mechanism, that will keep them from overlapping?
  - this is specific to the person/device tracking icons, and you-are-here icon
