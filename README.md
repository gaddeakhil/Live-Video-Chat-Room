# Socket chat

The React client and Socket.IO server are separate Node.js projects. Install dependencies and run each project from its own directory.

## Local development

In one terminal:

```sh
cd server
npm install
npm run dev
```

In another terminal:

```sh
cd client
npm install
npm run dev
```

The client runs at `http://localhost:5173` and connects to the server at `http://localhost:3001` by default. The server health endpoint is `http://localhost:3001/health`.

## Deployment

Deploy `server` and `client` as separate services. Build the client with `npm run build` from `client`, and run the server with `npm start` from `server`.

The deployment layout is:

- `client`: static Vite site; publish the generated `client/dist` directory.
- `server`: long-running Node.js service; start it with `npm start`.
- `client/.env.example` and `server/.env.example`: copy these into the relevant host's environment settings and replace the local URLs with public origins.

Set these environment variables in the hosting providers:

- **Server:** `CLIENT_ORIGIN` is the deployed client origin (for example, `https://chat.example.com`). `PORT` is normally provided by the host.
- **Client build:** `VITE_SERVER_URL` is the deployed server's public origin (for example, `https://api.example.com`). This value is embedded at build time.

Use the origins only, without Markdown brackets or trailing paths. For multiple allowed client origins, separate them with commas.
