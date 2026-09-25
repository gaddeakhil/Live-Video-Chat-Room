import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

const socket = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3001')

function App() {
	const [message, setMessage] = useState('')
	const [messages, setMessages] = useState([])
	const [connected, setConnected] = useState(socket.connected)
	const inputRef = useRef(null)

	useEffect(() => {
		const receiveMessage = (newMessage) => {
			setMessages((currentMessages) => [...currentMessages, newMessage])
		}
		const handleConnect = () => setConnected(true)
		const handleDisconnect = () => setConnected(false)

		socket.on('chat message', receiveMessage)
		socket.on('connect', handleConnect)
		socket.on('disconnect', handleDisconnect)
		inputRef.current?.focus()

		return () => {
			socket.off('chat message', receiveMessage)
			socket.off('connect', handleConnect)
			socket.off('disconnect', handleDisconnect)
		}
	}, [])

	const sendMessage = (event) => {
		event.preventDefault()
		const trimmedMessage = message.trim()
		
		if (!trimmedMessage) return

		socket.emit('chat message', trimmedMessage)
		setMessage('')
		inputRef.current?.focus()
	}

	return (
		<main className="app-shell">
			<section className="chat-window" aria-label="Socket chat">
				<header className="chat-header">
					<div>
						<p className="eyebrow">Live room</p>
						<h1>Small talk</h1>
					</div>
					<span className="status"><i /> {connected ? 'connected' : 'disconnected'}</span>
				</header>

				<div className="messages" aria-live="polite">
					{messages.length === 0 ? (
						<div className="empty-state">
							<span className="empty-icon">+</span>
							<p>No messages yet</p>
							<small>Send the first message to the room.</small>
						</div>
					) : (
						messages.map((item, index) => (
							<article className="message" key={`${item}-${index}`}>
								<span className="message-dot" />
								<p>{item}</p>
							</article>
						))
					)}
				</div>

				<form className="composer" onSubmit={sendMessage}>
					<input
						ref={inputRef}
						value={message}
						onChange={(event) => setMessage(event.target.value)}
						placeholder="Write a message..."
						aria-label="Message"
					/>
					<button type="submit">Send <span aria-hidden="true">↗</span></button>
				</form>
			</section>
		</main>
	)
}

export default App



