import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'

const app = express()
const httpServer = createServer(app)  

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const io = new Server(httpServer, {
  cors: { origin: allowedOrigins },
})


app.get('/health', (_request, response) => {
  response.json({ status: 'ok' })
})

io.on('connection', (socket) => {
  console.log('user connected')

  socket.on('chat message', (message) => {
    if (typeof message !== 'string') return
    const trimmedMessage = message.trim()
    if (trimmedMessage) io.emit('chat message', trimmedMessage)
  })
})

const port = process.env.PORT || 3001
httpServer.listen(port, () => {
  console.log(`Socket.IO server running at http://localhost:${port}`)
})
