// Harness deps
import { default as hyper } from 'https://raw.githubusercontent.com/hyper63/hyper/hyper%40v4.3.2/packages/core/mod.ts'
import { default as app } from 'https://raw.githubusercontent.com/hyper63/hyper/hyper-app-express%40v1.2.1/packages/app-express/mod.ts'

import bullmq from '../mod.ts'
import PORT_NAME from '../port_name.ts'

const hyperConfig = {
  app,
  middleware: [],
  adapters: [
    {
      port: PORT_NAME,
      plugins: [bullmq({ url: 'http://127.0.0.1:6379' })],
    },
  ],
}

hyper(hyperConfig)
