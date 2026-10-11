# Runbook

## Deploying

Deploys are manual: tag, build the image, roll it out one instance at a time.

## Poller

Poll timeout: _to be written_

## Notifier

Messages go out through the channels in `config/notifier.json`. If a channel is down, messages
are dropped and not retried.
