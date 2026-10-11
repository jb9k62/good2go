# Architecture

The poller asks carriers for news and writes it to the parcel store. The notifier turns a
status change into a message. The report rolls delivered parcels up by week. The API exposes
reports, parcels and carrier webhooks.

```text
carrier -> poller -> store -> report -> API
                        \-> notifier
carrier webhook -> API
```
