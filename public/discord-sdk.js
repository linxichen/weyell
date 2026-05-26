import { DiscordSDK } from '@discord/embedded-app-sdk';

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;
const params = new URLSearchParams(window.location.search);
const isDiscordEmbedded = params.has('frame_id');

export let discordSdk = null;
export let channelInfo = null;
export let guildInfo = null;
export let sdkReady = false;

const readyWaiters = [];
let readyResolved = false;

export function whenReady() {
  if (readyResolved) return Promise.resolve(sdkReady);
  return new Promise((resolve) => readyWaiters.push(resolve));
}

function resolveReady(value) {
  readyResolved = true;
  while (readyWaiters.length) readyWaiters.shift()(value);
}

function setChannel(name) {
  const el = document.getElementById('channel-name');
  if (el) el.textContent = name;
}

function setSdkStatus(state, label) {
  const dot = document.getElementById('sdk-dot');
  const text = document.getElementById('sdk-text');
  if (dot) dot.className = 'dot ' + state;
  if (text) text.textContent = label;
}

async function init() {
  if (!isDiscordEmbedded) {
    setChannel('# (standalone)');
    setSdkStatus('disconnected', 'not in discord');
    resolveReady(false);
    return;
  }
  if (!CLIENT_ID) {
    setChannel('# (no client id)');
    setSdkStatus('disconnected', 'missing client id');
    resolveReady(false);
    return;
  }
  setSdkStatus('connecting', 'discord init…');
  try {
    discordSdk = new DiscordSDK(CLIENT_ID);
    await discordSdk.ready();
    sdkReady = true;
    setSdkStatus('connected', 'discord ready');

    try {
      if (discordSdk.channelId) {
        channelInfo = await discordSdk.commands.getChannel({
          channel_id: discordSdk.channelId
        });
        setChannel(channelInfo?.name ? `# ${channelInfo.name}` : '# (dm)');
      } else {
        setChannel('# (no channel)');
      }
    } catch (e) {
      console.warn('[weyell] getChannel failed:', e);
      setChannel('# (unknown)');
    }

    resolveReady(true);
  } catch (err) {
    console.warn('[weyell] Discord SDK init failed:', err);
    setSdkStatus('disconnected', 'sdk error');
    resolveReady(false);
  }
}

init();
