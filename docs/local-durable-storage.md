# Durable storage for a local single-user installation

By default, OpenMAIC stores course documents and media in IndexedDB. Personal
notebooks and exercise attempts also use IndexedDB. Clearing **site data** removes
those databases; clearing only cached HTTP files normally does not. A ZIP export
is an independent copy.

The optional server persistence profile stores documents, assets, notes, bookmarks,
exercise attempts and recent visits in PostgreSQL. Browser storage remains a local
cache. A stable local identity makes the same library available after cookies and
IndexedDB are cleared. This profile is for one user on a loopback-bound server;
it does not implement public multi-user authentication.

Set these values before building, and keep the matching server values at runtime:

```
NEXT_PUBLIC_PERSISTENCE=1
DATABASE_URL=<PostgreSQL connection URL>
PERSISTENCE_DEV_TOKEN=<random token>
NEXT_PUBLIC_PERSISTENCE_TOKEN=<same token>
PERSISTENCE_ALLOW_INSECURE_DEV_AUTH=true
OPENMAIC_AGENT_RUNTIME_ENABLED=1
OPENMAIC_LOCAL_SINGLE_USER=1
LOCAL_LEARNER_KEY=<stable local identity>
NEXT_PUBLIC_LOCAL_LEARNER_KEY=<same identity>
ASSET_COLLECTION_ENABLED=0
```

The public token is a development gate, not a private user credential. Bind the
application to `127.0.0.1`. Keep configuration and the PostgreSQL data directory
outside release/build directories. Existing deployments with persistence disabled
retain their previous browser-only behavior.

## Switching an existing library

1. Before switching, export each browser-only course to a classroom ZIP and export
   the personal notebook separately. Keep these files.
2. Activate the persistence-enabled build and matching configuration.
3. Import the classroom ZIPs once. Imported courses receive new identifiers;
   existing notes and attempts are not automatically reassigned to these new IDs.
   Browser notebook/progress records migrate without overwriting server records,
   retaining their original course/scene identities.
4. Verify the library and media in a separate browser profile before deleting any
   browser data. Do not use clearing storage as an update procedure.

Legacy imported audio/media bytes are also copied into the server asset store,
with metadata in `local_learning_records`. Asset collection is disabled in this
profile because these legacy references are not yet part of the document-based
collector roots. Deleting local caches does not reclaim their server copies.

## Backups and validation

Schedule `pg_dump -Fc` outside the application, write to a temporary file, verify
with `pg_restore --list`, and rename only after success. Retain previous dumps.
Test restores into a separate database; never overwrite the running database to
test a backup. A database on the same disk survives browser clearing but does not
protect against loss of that disk; copy backups to another device for that case.

The opt-in `e2e/tests/durable-learning.spec.ts` runs against an isolated configured
server with `E2E_PERSISTENCE_TOKEN`. It creates a course, note and attempt, rejects
a stale note write, stores media, then verifies recovery from a fresh browser
context with a changed client learner key. Never point this fixture at a real
user's production database.
