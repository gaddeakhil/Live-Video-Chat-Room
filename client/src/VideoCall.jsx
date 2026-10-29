import { useCallback, useEffect, useRef, useState } from 'react'
import './VideoCall.css'

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

function VideoCall({ socket }) {
	const [roomId, setRoomId] = useState('')
	const [status, setStatus] = useState('not in a call')
	const [inCall, setInCall] = useState(false)
	const [muted, setMuted] = useState(false)
	const [cameraOff, setCameraOff] = useState(false)
	const [error, setError] = useState('')
	const localVideoRef = useRef(null)
	const remoteVideoRef = useRef(null)
	const peerConnectionRef = useRef(null)
	const localStreamRef = useRef(null)
	const roomIdRef = useRef('')
	const pendingCandidatesRef = useRef([])

	const closePeerConnection = useCallback(() => {
		peerConnectionRef.current?.close()
		peerConnectionRef.current = null
		pendingCandidatesRef.current = []
		if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
	}, [])

	const stopLocalStream = useCallback(() => {
		localStreamRef.current?.getTracks().forEach((track) => track.stop())
		localStreamRef.current = null
		if (localVideoRef.current) localVideoRef.current.srcObject = null
	}, [])

	const createPeerConnection = useCallback(() => {
		if (peerConnectionRef.current) return peerConnectionRef.current

		const peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS })
		peerConnectionRef.current = peerConnection
		localStreamRef.current?.getTracks().forEach((track) => {
			peerConnection.addTrack(track, localStreamRef.current)
		})
		peerConnection.onicecandidate = ({ candidate }) => {
			if (candidate && roomIdRef.current) {
				socket.emit('call:ice-candidate', {
					roomId: roomIdRef.current,
					candidate,
				})
			}
		}
		peerConnection.ontrack = ({ streams }) => {
			if (remoteVideoRef.current && streams[0]) {
				remoteVideoRef.current.srcObject = streams[0]
			}
		}
		peerConnection.onconnectionstatechange = () => {
			if (peerConnection.connectionState === 'connected') {
				setStatus('connected')
			} else if (peerConnection.connectionState === 'failed') {
				setStatus('connection failed; check TURN configuration')
			}
		}
		return peerConnection
	}, [socket])

	const applyPendingCandidates = useCallback(async (peerConnection) => {
		const candidates = pendingCandidatesRef.current
		pendingCandidatesRef.current = []
		for (const candidate of candidates) {
			await peerConnection.addIceCandidate(candidate)
		}
	}, [])

	const resetCall = useCallback(() => {
		closePeerConnection()
		stopLocalStream()
		roomIdRef.current = ''
		setRoomId('')
		setInCall(false)
		setMuted(false)
		setCameraOff(false)
	}, [closePeerConnection, stopLocalStream])

	useEffect(() => {
		const handleJoined = async ({ roomId: joinedRoomId, initiator }) => {
			roomIdRef.current = joinedRoomId
			setRoomId(joinedRoomId)
			setInCall(true)
			setStatus(initiator ? 'calling' : 'waiting for someone to join')
			setError('')

			if (initiator) {
				try {
					const peerConnection = createPeerConnection()
					const offer = await peerConnection.createOffer()
					await peerConnection.setLocalDescription(offer)
					socket.emit('call:offer', { roomId: joinedRoomId, description: offer })
				} catch (callError) {
					setError(`Could not start the call: ${callError.message}`)
					socket.emit('call:leave')
					resetCall()
				}
			}
		}

		const handlePeerJoined = () => setStatus('connecting')
		const handlePeerLeft = () => {
			closePeerConnection()
			setStatus('waiting for someone to join')
		}
		const handleCallError = ({ message }) => {
			setError(message)
			setStatus('not in a call')
			resetCall()
		}
		const handleOffer = async ({ roomId: offerRoomId, description }) => {
			if (roomIdRef.current !== offerRoomId) return
			try {
				const peerConnection = createPeerConnection()
				await peerConnection.setRemoteDescription(description)
				await applyPendingCandidates(peerConnection)
				const answer = await peerConnection.createAnswer()
				await peerConnection.setLocalDescription(answer)
				socket.emit('call:answer', {
					roomId: offerRoomId,
					description: answer,
				})
				setStatus('connecting')
			} catch (callError) {
				setError(`Could not answer the call: ${callError.message}`)
			}
		}
		const handleAnswer = async ({ roomId: answerRoomId, description }) => {
			if (roomIdRef.current !== answerRoomId || !peerConnectionRef.current) return
			try {
				await peerConnectionRef.current.setRemoteDescription(description)
				await applyPendingCandidates(peerConnectionRef.current)
				setStatus('connecting')
			} catch (callError) {
				setError(`Could not complete the call setup: ${callError.message}`)
			}
		}
		const handleIceCandidate = async ({ roomId: candidateRoomId, candidate }) => {
			if (roomIdRef.current !== candidateRoomId) return
			const peerConnection = peerConnectionRef.current
			if (!peerConnection?.remoteDescription) {
				pendingCandidatesRef.current.push(candidate)
				return
			}
			try {
				await peerConnection.addIceCandidate(candidate)
			} catch (callError) {
				setError(`Could not add a network candidate: ${callError.message}`)
			}
		}
		const handleDisconnect = () => {
			resetCall()
			setStatus('disconnected')
		}

		socket.on('call:joined', handleJoined)
		socket.on('call:peer-joined', handlePeerJoined)
		socket.on('call:peer-left', handlePeerLeft)
		socket.on('call:error', handleCallError)
		socket.on('call:offer', handleOffer)
		socket.on('call:answer', handleAnswer)
		socket.on('call:ice-candidate', handleIceCandidate)
		socket.on('disconnect', handleDisconnect)

		return () => {
			socket.off('call:joined', handleJoined)
			socket.off('call:peer-joined', handlePeerJoined)
			socket.off('call:peer-left', handlePeerLeft)
			socket.off('call:error', handleCallError)
			socket.off('call:offer', handleOffer)
			socket.off('call:answer', handleAnswer)
			socket.off('call:ice-candidate', handleIceCandidate)
			socket.off('disconnect', handleDisconnect)
			if (roomIdRef.current) socket.emit('call:leave')
			resetCall()
		}
	}, [socket, applyPendingCandidates, closePeerConnection, createPeerConnection, resetCall])

	const joinCall = async (event) => {
		event.preventDefault()
		const trimmedRoomId = roomId.trim()
		if (!trimmedRoomId) return

		setError('')
		setStatus('requesting camera and microphone')
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
				video: true,
			})
			localStreamRef.current = stream
			if (localVideoRef.current) localVideoRef.current.srcObject = stream
			setStatus('joining call')
			socket.emit('call:join', { roomId: trimmedRoomId })
		} catch (callError) {
			stopLocalStream()
			setStatus('not in a call')
			setError(`Could not access camera or microphone: ${callError.message}`)
		}
	}

	const leaveCall = () => {
		socket.emit('call:leave')
		resetCall()
		setStatus('not in a call')
		setError('')
	}

	const toggleTrack = (kind) => {
		if (kind === 'audio') {
			const enabled = muted
			localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = enabled })
			setMuted(!enabled)
			return
		}

		const enabled = cameraOff
		localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = enabled })
		setCameraOff(!enabled)
	}

	return (
		<section className="video-call" aria-label="Video call">
			<div className="call-heading">
				<div>
					<p className="eyebrow">WebRTC</p>
					<h2>Video call</h2>
				</div>
				<span className="call-status">{status}</span>
			</div>
			<form className="call-join" onSubmit={joinCall}>
				<input
					value={roomId}
					onChange={(event) => setRoomId(event.target.value)}
					placeholder="Enter a call room name"
					aria-label="Call room name"
					maxLength={64}
					disabled={inCall}
				/>
				<button type="submit" disabled={inCall || !socket.connected}>
					Join call
				</button>
				{inCall && <button className="leave-call" type="button" onClick={leaveCall}>Leave</button>}
			</form>
			{error && <p className="call-error" role="alert">{error}</p>}
			<div className="video-grid">
				<div className="video-tile">
					<video ref={localVideoRef} autoPlay muted playsInline />
					<span>You</span>
				</div>
				<div className="video-tile">
					<video ref={remoteVideoRef} autoPlay playsInline />
					<span>Participant</span>
				</div>
			</div>
			{inCall && (
				<div className="call-controls">
					<button type="button" onClick={() => toggleTrack('audio')}>
						{muted ? 'Unmute' : 'Mute'}
					</button>
					<button type="button" onClick={() => toggleTrack('video')}>
						{cameraOff ? 'Turn camera on' : 'Turn camera off'}
					</button>
				</div>
			)}
		</section>
	)
}

export default VideoCall
