<h1 align="center">hyper-adapter-bullmq</h1>
<p align="center">A Queue port adapter for BullMQ in the <a href="https://hyper.io/">hyper</a>  service framework</p>
</p>
<p align="center">
  <a href="https://github.com/hyper63/hyper-adapter-bullmq/actions/workflows/test-and-publish.yml"><img src="https://github.com/hyper63/hyper-adapter-bullmq/actions/workflows/test-and-publish.yml/badge.svg" alt="Test" /></a>
  <a href="https://github.com/hyper63/hyper-adapter-bullmq/tags/"><img src="https://img.shields.io/github/tag/hyper63/hyper-adapter-bullmq" alt="Current Version" /></a>
</p>

---

<!-- toc -->

- [Getting Started](#getting-started)
- [Methods](#methods)
- [Testing](#testing)
- [License](#license)

<!-- tocstop -->

## Getting Started

```ts
import { default as bullmq } from 'https://raw.githubusercontent.com/hyper63/hyper-adapter-bullmq/v1.0.1/mod.ts'

export default {
  app,
  adapter: [
    {
      port: 'queue',
      plugins: [
        bullmq({
          url: 'http://user@password@redis.host:6379',
        }),
      ],
    },
  ],
}
```

You can pass the following configuration to the adapter:

```ts
export type AdapterConfig = {
  /**
   * The redis server connection string
   */
  url: string
  options?: {
    /**
     * How many Workers to spawn in order to process jobs.
     *
     * Defaults to 10
     */
    concurrency?: number
    /**
     * The Time-To-Live for jobs whose processing fails. The job payload,
     * along with the error is stored in redis.
     *
     * Defaults to 7 days.
     */
    failedTtl?: number
    /**
     * A prefix you'd like all keys created by the adapter to use.
     *
     * Defaults to no prefix ie. ''
     */
    keyPrefix?: string
    /**
     * Whether the Redis Server being used is clustered.
     *
     * Defaults to false
     */
    cluster?: boolean
  }
}
```

## Methods

This adapter fully implements the Queue port and can be used as the
[hyper Queue service](https://hyper63.github.io/docs/docs/api-reference/rest/queue.html) adapter

See the full port [here](https://github.com/hyper63/hyper/tree/main/packages/port-queue)

## Testing

Run Tests

```sh
deno task test
```

To lint, check formatting, and run unit tests

Run Integration Tests

> You will need a Redis Server running and `REDIS_URL` set to your Redis server connection string

```sh
deno task test:integration
```

Run Test Harness

```sh
deno task test:harness
```

## License

Apache-2.0
