import { ApplicationFlagsBitField, Client, GatewayIntentBits, Events, REST, Routes } from 'discord.js';
import { commands, handleCommand, handleButton, setCanReadMessages } from './src/commands.js';

const token = (process.env.DISCORD_TOKEN || '').trim();
if (!token) {
  console.error('[ticket-bot] DISCORD_TOKEN is not set. Add your bot token in the FadeHost panel, under Environment variables.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.once(Events.ClientReady, async (c) => {
  console.log(`[ticket-bot] online as ${c.user.tag} in ${c.guilds.cache.size} server(s)`);
  c.user.setActivity('for tickets', { type: 3 });
  // Transcripts are only whole when the app may read what members write.
  const flags = c.application.flags ?? (await c.application.fetch().catch(() => null))?.flags;
  if (flags) {
    const canRead = flags.has(ApplicationFlagsBitField.Flags.GatewayMessageContent) || flags.has(ApplicationFlagsBitField.Flags.GatewayMessageContentLimited);
    setCanReadMessages(canRead);
    if (!canRead) {
      console.warn('[ticket-bot] The Message Content intent is off, so transcripts will leave out what members wrote. Turn it on at discord.com/developers, your app, Bot, Privileged Gateway Intents, then restart the bot.');
    }
  }
  try {
    await new REST().setToken(token).put(Routes.applicationCommands(c.user.id), { body: commands });
    console.log('[ticket-bot] slash commands registered');
  } catch (err) {
    console.error('[ticket-bot] failed to register commands:', err.message);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) await handleCommand(interaction);
    else if (interaction.isButton()) await handleButton(interaction);
  } catch (err) {
    console.error('[ticket-bot] interaction error:', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Something went wrong. Check the bot has Manage Channels in this server.', ephemeral: true }).catch(() => {});
    }
  }
});

client.login(token).catch((error) => {
  if (String(error.code) === 'TokenInvalid' || String(error).includes('TOKEN_INVALID')) {
    console.error('[ticket-bot] Discord rejected DISCORD_TOKEN. Reset it at discord.com/developers, your app, Bot, Reset Token; paste the new one under Environment variables in the FadeHost panel and restart.');
  } else {
    console.error(`[ticket-bot] Could not log in to Discord: ${error.message}`);
  }
  process.exit(1);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    client.destroy();
    process.exit(0);
  });
}
const tickets = require("./src/tickets");
tickets.init(client);
