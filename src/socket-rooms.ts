import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';

interface Participant {
    id: string;
    displayName: string;
    photoURL: string | null;
    tier?: string;
    joinedAt: Date;
}

interface Room {
    id: string;
    hostId: string;
    hostName: string;
    hostPhoto: string | null;
    isPublic: boolean;
    participants: Map<string, Participant>;
    bannedUsers: Set<string>;
    currentSong: {
        id: string;
        name: string;
        artist: string;
        image: string;
        audioUrl: string;
    } | null;
    isPlaying: boolean;
    currentTime: number;
    lastSyncAt: Date;
    createdAt: Date;
}

// In-memory room storage
const rooms = new Map<string, Room>();
const userRooms = new Map<string, string>(); // userId -> roomId

// Generate simple 5-character room code
const generateRoomCode = (): string => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Ensure unique
    if (rooms.has(code)) return generateRoomCode();
    return code;
};

export const initializeSocketIO = (httpServer: HttpServer) => {
    const io = new Server(httpServer, {
        cors: {
            origin: ["http://localhost:3001", "http://localhost:3000", process.env.CLIENT_URL || "*"],
            methods: ["GET", "POST"],
            credentials: true
        },
        pingTimeout: 60000,
        pingInterval: 25000
    });

    io.on('connection', (socket: Socket) => {
        console.log(`[Socket.io] User connected: ${socket.id}`);
        let currentUserId: string | null = null;

        // Authenticate user
        socket.on('auth', (data: { userId: string; displayName: string; photoURL: string | null }) => {
            currentUserId = data.userId;
            console.log(`[Socket.io] User authenticated: ${currentUserId}`);

            // Check if user was in a room
            const existingRoomId = userRooms.get(currentUserId);
            if (existingRoomId && rooms.has(existingRoomId)) {
                socket.join(existingRoomId);
                const room = rooms.get(existingRoomId)!;
                socket.emit('room:joined', formatRoom(room));
            }
        });

        // Create Room
        socket.on('room:create', (data: { userId: string; displayName: string; photoURL: string | null; tier?: string; isPublic?: boolean }, callback) => {
            try {
                const roomId = generateRoomCode();

                const room: Room = {
                    id: roomId,
                    hostId: data.userId,
                    hostName: data.displayName,
                    hostPhoto: data.photoURL,
                    isPublic: data.isPublic === true,
                    participants: new Map([[data.userId, {
                        id: data.userId,
                        displayName: data.displayName,
                        photoURL: data.photoURL,
                        tier: data.tier,
                        joinedAt: new Date()
                    }]]),
                    bannedUsers: new Set(),
                    currentSong: null,
                    isPlaying: false,
                    currentTime: 0,
                    lastSyncAt: new Date(),
                    createdAt: new Date()
                };

                rooms.set(roomId, room);
                userRooms.set(data.userId, roomId);
                socket.join(roomId);

                console.log(`[Socket.io] Room created: ${roomId} by ${data.displayName}`);
                callback({ success: true, room: formatRoom(room) });
            } catch (error: any) {
                callback({ success: false, error: error.message });
            }
        });

        // Join Room
        socket.on('room:join', (data: { roomId: string; userId: string; displayName: string; photoURL: string | null; tier?: string; isAdmin?: boolean }, callback) => {
            try {
                const roomId = data.roomId.toUpperCase().trim();
                const room = rooms.get(roomId);

                if (!room) {
                    callback({ success: false, error: 'Room not found' });
                    return;
                }

                if (room.bannedUsers.has(data.userId)) {
                    callback({ success: false, error: 'You are banned from this room' });
                    return;
                }

                // Leave any existing room
                const existingRoom = userRooms.get(data.userId);
                if (existingRoom && existingRoom !== roomId) {
                    leaveRoom(socket, data.userId, existingRoom);
                }

                // Add participant (unless admin secret join)
                if (!data.isAdmin) {
                    room.participants.set(data.userId, {
                        id: data.userId,
                        displayName: data.displayName,
                        photoURL: data.photoURL,
                        tier: data.tier,
                        joinedAt: new Date()
                    });
                }

                userRooms.set(data.userId, roomId);
                socket.join(roomId);

                // Notify others (only for non-admin joins)
                if (!data.isAdmin) {
                    socket.to(roomId).emit('room:participant_joined', {
                        userId: data.userId,
                        displayName: data.displayName,
                        photoURL: data.photoURL,
                        tier: data.tier
                    });
                }

                console.log(`[Socket.io] ${data.displayName} joined room: ${roomId}${data.isAdmin ? ' (admin - hidden)' : ''}`);
                callback({ success: true, room: formatRoom(room) });
            } catch (error: any) {
                callback({ success: false, error: error.message });
            }
        });

        // Leave Room
        socket.on('room:leave', (data: { userId: string }, callback) => {
            try {
                const roomId = userRooms.get(data.userId);
                if (roomId) {
                    leaveRoom(socket, data.userId, roomId);
                }
                callback({ success: true });
            } catch (error: any) {
                callback({ success: false, error: error.message });
            }
        });

        // Sync Playback (Host only)
        socket.on('room:sync', (data: { userId: string; isPlaying: boolean; currentTime: number; song?: any }) => {
            const roomId = userRooms.get(data.userId);
            if (!roomId) return;

            const room = rooms.get(roomId);
            if (!room || room.hostId !== data.userId) return;

            room.isPlaying = data.isPlaying;
            room.currentTime = data.currentTime;
            room.lastSyncAt = new Date();

            if (data.song) {
                room.currentSong = {
                    id: data.song.id || data.song.songId,
                    name: data.song.name || data.song.title,
                    artist: data.song.artists?.primary?.[0]?.name || data.song.artist || 'Unknown',
                    image: typeof data.song.image === 'string' ? data.song.image :
                        data.song.image?.[data.song.image.length - 1]?.url || '',
                    audioUrl: data.song.downloadUrl?.[4]?.url || data.song.downloadUrl?.[2]?.url || data.song.audioUrl || ''
                };
            }

            // Broadcast to all participants except host
            socket.to(roomId).emit('room:sync_update', {
                isPlaying: room.isPlaying,
                currentTime: room.currentTime,
                currentSong: room.currentSong,
                lastSyncAt: room.lastSyncAt
            });
        });

        // Transfer Host
        socket.on('room:transfer_host', (data: { userId: string; newHostId: string }, callback) => {
            try {
                const roomId = userRooms.get(data.userId);
                if (!roomId) throw new Error('Not in a room');

                const room = rooms.get(roomId);
                if (!room) throw new Error('Room not found');
                if (room.hostId !== data.userId) throw new Error('Not the host');

                const newHost = room.participants.get(data.newHostId);
                if (!newHost) throw new Error('User not in room');

                room.hostId = data.newHostId;
                room.hostName = newHost.displayName;
                room.hostPhoto = newHost.photoURL;

                io.to(roomId).emit('room:host_changed', {
                    newHostId: data.newHostId,
                    hostName: newHost.displayName,
                    hostPhoto: newHost.photoURL
                });

                callback({ success: true });
            } catch (error: any) {
                callback({ success: false, error: error.message });
            }
        });

        // Remove Listener
        socket.on('room:remove_listener', (data: { userId: string; targetId: string }, callback) => {
            try {
                const roomId = userRooms.get(data.userId);
                if (!roomId) throw new Error('Not in a room');

                const room = rooms.get(roomId);
                if (!room) throw new Error('Room not found');
                if (room.hostId !== data.userId) throw new Error('Not the host');

                room.participants.delete(data.targetId);
                userRooms.delete(data.targetId);

                io.to(roomId).emit('room:participant_left', { userId: data.targetId });

                // Find target's socket and force them out
                const targetSocket = Array.from(io.sockets.sockets.values()).find(s =>
                    (s as any).userId === data.targetId
                );
                if (targetSocket) {
                    targetSocket.leave(roomId);
                    targetSocket.emit('room:removed');
                }

                callback({ success: true });
            } catch (error: any) {
                callback({ success: false, error: error.message });
            }
        });

        // Ban Listener
        socket.on('room:ban_listener', (data: { userId: string; targetId: string }, callback) => {
            try {
                const roomId = userRooms.get(data.userId);
                if (!roomId) throw new Error('Not in a room');

                const room = rooms.get(roomId);
                if (!room) throw new Error('Room not found');
                if (room.hostId !== data.userId) throw new Error('Not the host');

                room.participants.delete(data.targetId);
                room.bannedUsers.add(data.targetId);
                userRooms.delete(data.targetId);

                io.to(roomId).emit('room:participant_left', { userId: data.targetId, banned: true });

                const targetSocket = Array.from(io.sockets.sockets.values()).find(s =>
                    (s as any).userId === data.targetId
                );
                if (targetSocket) {
                    targetSocket.leave(roomId);
                    targetSocket.emit('room:banned');
                }

                callback({ success: true });
            } catch (error: any) {
                callback({ success: false, error: error.message });
            }
        });

        // Get Room Info
        socket.on('room:info', (data: { roomId: string }, callback) => {
            const room = rooms.get(data.roomId.toUpperCase().trim());
            if (room) {
                callback({ success: true, room: formatRoom(room) });
            } else {
                callback({ success: false, error: 'Room not found' });
            }
        });

        // Get All Rooms (Admin only)
        socket.on('admin:get_rooms', (callback) => {
            const allRooms = Array.from(rooms.values()).map(formatRoom);
            callback({ success: true, rooms: allRooms });
        });

        // List currently-active PUBLIC rooms for discovery. Private rooms are
        // never included — they're joinable only by entering the room code.
        socket.on('room:list_public', (callback) => {
            if (typeof callback !== 'function') return;
            const publicRooms = Array.from(rooms.values())
                .filter((room) => room.isPublic === true)
                .map(formatPublicRoom);
            callback({ success: true, rooms: publicRooms });
        });

        // Disconnect
        socket.on('disconnect', () => {
            console.log(`[Socket.io] User disconnected: ${socket.id}`);
            // Don't auto-leave room on disconnect (allow reconnect)
        });
    });

    // Helper: Leave room
    const leaveRoom = (socket: Socket, userId: string, roomId: string) => {
        const room = rooms.get(roomId);
        if (!room) return;

        if (room.hostId === userId) {
            // Host leaving - end room
            io.to(roomId).emit('room:ended');
            room.participants.forEach((_, participantId) => {
                userRooms.delete(participantId);
            });
            rooms.delete(roomId);
            console.log(`[Socket.io] Room ended: ${roomId}`);
        } else {
            // Participant leaving
            room.participants.delete(userId);
            userRooms.delete(userId);
            socket.leave(roomId);
            io.to(roomId).emit('room:participant_left', { userId });
        }
    };

    // Helper: A lightweight summary for the public-rooms discovery list — only
    // what the browse UI needs (host, current song, listener count). Never
    // exposes participant details or the banned list.
    const formatPublicRoom = (room: Room) => ({
        id: room.id,
        hostName: room.hostName,
        hostPhoto: room.hostPhoto,
        listenerCount: room.participants.size,
        currentSong: room.currentSong,
        isPlaying: room.isPlaying
    });

    // Helper: Format room for client
    const formatRoom = (room: Room) => ({
        id: room.id,
        hostId: room.hostId,
        hostName: room.hostName,
        hostPhoto: room.hostPhoto,
        isPublic: room.isPublic,
        participants: Array.from(room.participants.keys()),
        participantDetails: Object.fromEntries(room.participants),
        bannedUsers: Array.from(room.bannedUsers),
        currentSong: room.currentSong,
        isPlaying: room.isPlaying,
        currentTime: room.currentTime,
        lastSyncAt: room.lastSyncAt,
        createdAt: room.createdAt
    });

    // Cleanup stale rooms every 10 minutes
    setInterval(() => {
        const now = Date.now();
        rooms.forEach((room, roomId) => {
            // Remove rooms older than 6 hours with no activity
            if (now - room.lastSyncAt.getTime() > 6 * 60 * 60 * 1000) {
                room.participants.forEach((_, participantId) => {
                    userRooms.delete(participantId);
                });
                rooms.delete(roomId);
                console.log(`[Socket.io] Cleaned up stale room: ${roomId}`);
            }
        });
    }, 10 * 60 * 1000);

    console.log('[Socket.io] Listen Together rooms initialized');
    return io;
};
