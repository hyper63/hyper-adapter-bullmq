import PORT_NAME from './port_name.ts'

export default (config) => ({
  id: 'bullmq',
  port: PORT_NAME,
  load: async () => {}, // load env
  link: (env: unknown) => (_: unknown) => ({}), // link adapter
})
