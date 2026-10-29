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
const callRooms = new Map()


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

  socket.on('call:join', async (payload) => {
    const roomId = payload && typeof payload === 'object' ? payload.roomId : undefined
    if (socket.data.callRoom) {
      socket.emit('call:error', { message: 'Leave your current call before joining another.' })
      return
    }
    if (typeof roomId !== 'string' || !/^[\w-]{1,64}$/.test(roomId)) {
      socket.emit('call:error', { message: 'Room names can use letters, numbers, underscores, and hyphens.' })
      return
    }

    let members = callRooms.get(roomId)
    if (!members) {
      members = new Set()
      callRooms.set(roomId, members)
    }
    if (members.size >= 2) {
      socket.emit('call:error', { message: 'That call room is full.' })
      return
    }

    const initiator = members.size === 1
    members.add(socket.id)
    socket.data.callRoom = roomId
    try {
      await socket.join(roomId)
    } catch (error) {
      members.delete(socket.id)
      socket.data.callRoom = null
      if (members.size === 0) callRooms.delete(roomId)
      console.error(`Could not join call room ${roomId}.`, error)
      socket.emit('call:error', { message: 'Could not join the call room.' })
      return
    }
    socket.emit('call:joined', { roomId, initiator })
    if (initiator) socket.to(roomId).emit('call:peer-joined', { roomId })
  })

  socket.on('call:leave', () => {
    leaveCall(socket)
  })

  for (const event of ['call:offer', 'call:answer', 'call:ice-candidate']) {
    socket.on(event, (payload) => {
      if (!payload || typeof payload !== 'object') return
      const { roomId, description, candidate } = payload
      if (!roomId || socket.data.callRoom !== roomId) return
      const members = callRooms.get(roomId)
      if (!members || members.size !== 2) return

      if (event === 'call:offer' || event === 'call:answer') {
        if (!description || typeof description !== 'object' || typeof description.sdp !== 'string') return
        if (event === 'call:offer' && description.type !== 'offer') return
        if (event === 'call:answer' && description.type !== 'answer') return
        socket.to(roomId).emit(event, { roomId, description })
      } else if (candidate && typeof candidate.candidate === 'string') {
        socket.to(roomId).emit(event, { roomId, candidate })
      }
    })
  }

  socket.on('disconnect', () => {
    leaveCall(socket)
  })
})

function leaveCall(socket) {
  const roomId = socket.data.callRoom
  if (!roomId) return

  const members = callRooms.get(roomId)
  members?.delete(socket.id)
  socket.data.callRoom = null
  socket.leave(roomId)

  if (members?.size === 0) callRooms.delete(roomId)
  else io.to(roomId).except(socket.id).emit('call:peer-left', { roomId })
}

const port = process.env.PORT || 3001
httpServer.listen(port, () => {
  console.log(`Socket.IO server running at http://localhost:${port}`)
})
