
const {
    Client,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    SlashCommandBuilder,
    ChannelType,
    PermissionsBitField,
    AttachmentBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// =====================================================
// SKY RP EH - SKY TICKETS ULTIMATE
// =====================================================

const CONFIG = {
    STAFF_ROLE_ID: "1559614432403787857",
    LOGS_CHANNEL_ID: "1559614900844896326",
    CATEGORY_ID: null,

    MAX_OPEN_TICKETS: 3,
    TRANSCRIPT_LIMIT: 1000,

    PREFIX: "!ticket",

    TIMEZONE: "Indian/Reunion",

    COLORS: {
        BLUE: 0x3498DB,
        GREEN: 0x2ECC71,
        RED: 0xE74C3C,
        ORANGE: 0xF39C12,
        PURPLE: 0x9B59B6,
        DARK: 0x23272A
    }
};

// =====================================================
// STOCKAGE PERSISTANT
// =====================================================

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "tickets.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadDatabase() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            return { tickets: {}, counters: {} };
        }

        const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

        return {
            tickets: data.tickets || {},
            counters: data.counters || {}
        };
    } catch (error) {
        console.error("[SKY TICKETS] Lecture :", error);
        return { tickets: {}, counters: {} };
    }
}

let database = loadDatabase();
let saveQueue = Promise.resolve();

function saveDatabase() {
    saveQueue = saveQueue.then(async () => {
        const temporaryFile = `${DATA_FILE}.tmp`;

        await fs.promises.writeFile(
            temporaryFile,
            JSON.stringify(database, null, 2),
            "utf8"
        );

        await fs.promises.rename(temporaryFile, DATA_FILE);
    }).catch(error => {
        console.error("[SKY TICKETS] Sauvegarde :", error);
    });

    return saveQueue;
}

// =====================================================
// CATÉGORIES
// =====================================================

const CATEGORIES = {
    assistance: {
        label: "Assistance",
        emoji: "🆘",
        description: "Aide générale"
    },
    recrutement: {
        label: "Recrutement",
        emoji: "📋",
        description: "Candidature staff"
    },
    signalement: {
        label: "Signalement",
        emoji: "🚨",
        description: "Signaler un problème"
    },
    moderation: {
        label: "Modération",
        emoji: "⚖️",
        description: "Contester une sanction"
    },
    bug: {
        label: "Développement",
        emoji: "💻",
        description: "Problème technique"
    },
    partenariat: {
        label: "Partenariat",
        emoji: "🤝",
        description: "Proposition commerciale ou communautaire"
    },
    direction: {
        label: "Direction",
        emoji: "👑",
        description: "Contacter la direction"
    },
    autre: {
        label: "Autre demande",
        emoji: "💬",
        description: "Toute autre demande"
    }
};

const PRIORITIES = {
    low: { label: "Faible", emoji: "🟢", color: CONFIG.COLORS.GREEN },
    normal: { label: "Normale", emoji: "🔵", color: CONFIG.COLORS.BLUE },
    high: { label: "Élevée", emoji: "🟠", color: CONFIG.COLORS.ORANGE },
    urgent: { label: "Urgente", emoji: "🔴", color: CONFIG.COLORS.RED }
};

// =====================================================
// UTILITAIRES
// =====================================================

const initialized = new WeakSet();

function isStaff(member) {
    return member.permissions.has(
        PermissionsBitField.Flags.Administrator
    ) || member.roles.cache.has(CONFIG.STAFF_ROLE_ID);
}

function getTicket(channel) {
    if (!channel) return null;

    return database.tickets[channel.id] || null;
}

function createEmbed(title, description, color = CONFIG.COLORS.BLUE) {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp()
        .setFooter({ text: "SKY RP EH • SKY TICKETS ULTIMATE" });
}

async function getLogChannel(guild) {
    return guild.channels.fetch(CONFIG.LOGS_CHANNEL_ID).catch(() => null);
}

async function logAction(guild, title, description, color = CONFIG.COLORS.BLUE) {
    const channel = await getLogChannel(guild);

    if (!channel || !channel.isTextBased()) return;

    await channel.send({
        embeds: [createEmbed(title, description, color)]
    }).catch(error => {
        console.error("[SKY TICKETS] Logs :", error);
    });
}

function getOpenTickets(userId, guildId) {
    return Object.values(database.tickets).filter(ticket =>
        ticket.ownerId === userId &&
        ticket.guildId === guildId &&
        ticket.status !== "deleted"
    );
}

function getTicketControls(ticket) {
    if (ticket.status === "closed") {
        return [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("sky_reopen")
                    .setLabel("Réouvrir")
                    .setEmoji("🔓")
                    .setStyle(ButtonStyle.Success),

                new ButtonBuilder()
                    .setCustomId("sky_transcript")
                    .setLabel("Transcription")
                    .setEmoji("📄")
                    .setStyle(ButtonStyle.Secondary),

                new ButtonBuilder()
                    .setCustomId("sky_delete")
                    .setLabel("Supprimer")
                    .setEmoji("🗑️")
                    .setStyle(ButtonStyle.Danger)
            )
        ];
    }

    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("sky_claim")
                .setLabel(ticket.claimedBy ? "Déjà pris" : "Prendre en charge")
                .setEmoji("🙋")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(Boolean(ticket.claimedBy)),

            new ButtonBuilder()
                .setCustomId("sky_priority")
                .setLabel("Priorité")
                .setEmoji("🚦")
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId("sky_close")
                .setLabel("Fermer")
                .setEmoji("🔒")
                .setStyle(ButtonStyle.Danger)
        )
    ];
}

function getTicketEmbed(ticket) {
    const category = CATEGORIES[ticket.category] || CATEGORIES.autre;
    const priority = PRIORITIES[ticket.priority] || PRIORITIES.normal;

    return createEmbed(
        `${category.emoji} ${category.label} • ${ticket.number}`,
        `Bienvenue dans ton ticket **${ticket.number}**.\n\n` +
        `**Propriétaire :** <@${ticket.ownerId}>\n` +
        `**Catégorie :** ${category.label}\n` +
        `**Priorité :** ${priority.emoji} ${priority.label}\n` +
        `**Statut :** ${ticket.status === "closed" ? "🔒 Fermé" : "🟢 Ouvert"}\n` +
        `**Responsable :** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Aucun"}\n\n` +
        "Explique librement ta demande. Notre équipe va te répondre."
    );
}

// =====================================================
// TRANSCRIPT HTML
// =====================================================

function escapeHTML(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

async function generateTranscript(channel) {
    const messages = [];
    let before;

    while (messages.length < CONFIG.TRANSCRIPT_LIMIT) {
        const batch = await channel.messages.fetch({
            limit: Math.min(100, CONFIG.TRANSCRIPT_LIMIT - messages.length),
            ...(before ? { before } : {})
        });

        if (!batch.size) break;

        messages.push(...batch.values());
        before = batch.last().id;

        if (batch.size < 100) break;
    }

    messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const content = messages.map(message => {
        const date = new Date(message.createdTimestamp).toLocaleString("fr-FR", {
            timeZone: CONFIG.TIMEZONE
        });

        const attachments = [...message.attachments.values()]
            .map(file => `<a href="${escapeHTML(file.url)}">${escapeHTML(file.name || "Pièce jointe")}</a>`)
            .join("<br>");

        return `
        <article class="message">
            <div class="author">${escapeHTML(message.author.tag)}</div>
            <div class="date">${escapeHTML(date)}</div>
            <div class="text">${escapeHTML(message.content || "[Message sans texte]")}</div>
            ${attachments ? `<div>${attachments}</div>` : ""}
        </article>`;
    }).join("\n");

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>SKY RP EH - Transcription</title>
<style>
body {
    background: #17191f;
    color: #f5f5f5;
    font-family: Arial, sans-serif;
    padding: 30px;
}
header {
    border-bottom: 2px solid #3498db;
    padding-bottom: 15px;
    margin-bottom: 25px;
}
.message {
    background: #242832;
    border-radius: 9px;
    padding: 15px;
    margin-bottom: 12px;
    overflow-wrap: anywhere;
}
.author { color: #58a6ff; font-weight: bold; }
.date { color: #999; font-size: 12px; margin: 5px 0; }
.text { white-space: pre-wrap; }
a { color: #58a6ff; }
</style>
</head>
<body>
<header>
<h1>🎫 SKY RP EH</h1>
<h2>Transcription : ${escapeHTML(channel.name)}</h2>
<p>Messages exportés : ${messages.length}</p>
</header>
${content}
</body>
</html>`;

    return new AttachmentBuilder(
        Buffer.from(html, "utf8"),
        { name: `transcript-${channel.id}.html` }
    );
}

async function sendTranscript(channel) {
    const guild = channel.guild;
    const logChannel = await getLogChannel(guild);

    if (!logChannel || !logChannel.isTextBased()) {
        throw new Error("Salon de logs indisponible.");
    }

    const transcript = await generateTranscript(channel);

    await logChannel.send({
        content: `📄 **Transcription du ticket ${channel.name}**`,
        files: [transcript]
    });
}

// =====================================================
// CRÉATION DU PANNEAU
// =====================================================

function createPanel() {
    const embed = createEmbed(
        "🎫 SKY RP EH • Centre d'assistance",
        "Bienvenue dans le centre officiel de support SKY RP EH.\n\n" +
        "Notre équipe est disponible pour vous accompagner.\n\n" +
        "**Comment fonctionne le système ?**\n" +
        "1. Sélectionnez une catégorie.\n" +
        "2. Un salon privé sera créé.\n" +
        "3. Présentez librement votre demande.\n" +
        "4. Un membre du staff vous répondra.\n\n" +
        "Vous pouvez également joindre des captures d'écran et des documents.\n\n" +
        "Merci de rester respectueux et de ne pas multiplier les demandes."
    );

    const menu = new StringSelectMenuBuilder()
        .setCustomId("sky_category")
        .setPlaceholder("Choisissez le motif de votre demande")
        .addOptions(
            Object.entries(CATEGORIES).map(([value, category]) => ({
                label: category.label,
                value,
                emoji: category.emoji,
                description: category.description
            }))
        );

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(menu)
        ]
    };
}

// =====================================================
// CRÉATION D'UN TICKET
// =====================================================

async function createTicket(interaction, categoryKey) {
    const guild = interaction.guild;
    const user = interaction.user;

    const category = CATEGORIES[categoryKey];

    if (!category) {
        return interaction.reply({
            content: "Catégorie invalide.",
            ephemeral: true
        });
    }

    const existing = getOpenTickets(user.id, guild.id);

    if (existing.length >= CONFIG.MAX_OPEN_TICKETS) {
        return interaction.reply({
            content: `❌ Tu as déjà atteint la limite de ${CONFIG.MAX_OPEN_TICKETS} tickets ouverts.`,
            ephemeral: true
        });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        const staffRole = await guild.roles.fetch(CONFIG.STAFF_ROLE_ID);

        if (!staffRole) {
            return interaction.editReply("❌ Le rôle staff est introuvable.");
        }

        const number = (database.counters[guild.id] || 0) + 1;
        database.counters[guild.id] = number;

        const ticketNumber = `SKY-${String(number).padStart(4, "0")}`;

        const permissions = [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
                id: user.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                    PermissionsBitField.Flags.AttachFiles,
                    PermissionsBitField.Flags.EmbedLinks
                ]
            },
            {
                id: staffRole.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                    PermissionsBitField.Flags.ManageMessages,
                    PermissionsBitField.Flags.AttachFiles
                ]
            },
            {
                id: interaction.client.user.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                    PermissionsBitField.Flags.ManageChannels,
                    PermissionsBitField.Flags.AttachFiles
                ]
            }
        ];

        const channel = await guild.channels.create({
            name: `ticket-${String(number).padStart(4, "0")}`,
            type: ChannelType.GuildText,
            topic: `SKY:${ticketNumber};OWNER:${user.id};STATUS:open`,
            permissionOverwrites: permissions,
            parent: CONFIG.CATEGORY_ID || undefined,
            reason: `Ticket créé par ${user.tag}`
        });

        const ticket = {
            id: channel.id,
            number: ticketNumber,
            guildId: guild.id,
            ownerId: user.id,
            category: categoryKey,
            priority: "normal",
            status: "open",
            claimedBy: null,
            participants: [],
            createdAt: Date.now(),
            closedAt: null,
            closedBy: null,
            closeReason: null,
            history: []
        };

        database.tickets[channel.id] = ticket;

        ticket.history.push({
            action: "created",
            userId: user.id,
            timestamp: Date.now()
        });

        await saveDatabase();

        await channel.send({
            content: `<@${user.id}> <@&${staffRole.id}>`,
            embeds: [getTicketEmbed(ticket)],
            components: getTicketControls(ticket),
            allowedMentions: {
                users: [user.id],
                roles: [staffRole.id]
            }
        });

        await interaction.editReply({
            content: `✅ Ton ticket ${ticketNumber} a été créé : ${channel}`
        });

        await logAction(
            guild,
            "🟢 Nouveau ticket",
            `**Ticket :** ${ticketNumber}\n**Membre :** ${user.tag}\n**Catégorie :** ${category.label}\n**Salon :** ${channel}`,
            CONFIG.COLORS.GREEN
        );

    } catch (error) {
        console.error("[SKY TICKETS] Création :", error);

        await interaction.editReply({
            content: "❌ Une erreur est survenue lors de la création du ticket."
        }).catch(() => {});
    }
}

// =====================================================
// CONTRÔLES DU STAFF
// =====================================================

async function requireStaff(interaction) {
    if (!isStaff(interaction.member)) {
        await interaction.reply({
            content: "❌ Cette action est réservée au staff.",
            ephemeral: true
        });

        return false;
    }

    return true;
}

async function updateTicket(interaction, ticket) {
    const channel = interaction.channel;

    await channel.messages.fetch({ limit: 20 }).then(messages => {
        const panel = messages.find(message =>
            message.author.id === interaction.client.user.id &&
            message.embeds.length > 0 &&
            message.components.length > 0
        );

        if (panel) {
            return panel.edit({
                embeds: [getTicketEmbed(ticket)],
                components: getTicketControls(ticket)
            });
        }
    }).catch(() => {});
}

function record(ticket, action, userId, details = {}) {
    ticket.history.push({
        action,
        userId,
        timestamp: Date.now(),
        ...details
    });
}

// =====================================================
// NOTES INTERNES
// =====================================================

async function createNote(interaction) {
    const modal = new ModalBuilder()
        .setCustomId("sky_note_modal")
        .setTitle("Ajouter une note interne");

    const input = new TextInputBuilder()
        .setCustomId("note")
        .setLabel("Note réservée au staff")
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(1000)
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(input)
    );

    await interaction.showModal(modal);
}

// =====================================================
// COMMANDES SLASH
// =====================================================

const commands = [
    new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Ouvrir le centre de tickets SKY RP EH"),

    new SlashCommandBuilder()
        .setName("ticket-claim")
        .setDescription("Prendre en charge ce ticket"),

    new SlashCommandBuilder()
        .setName("ticket-close")
        .setDescription("Fermer ce ticket")
        .addStringOption(option =>
            option.setName("raison")
                .setDescription("Motif de fermeture")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("ticket-reopen")
        .setDescription("Réouvrir ce ticket"),

    new SlashCommandBuilder()
        .setName("ticket-priority")
        .setDescription("Modifier la priorité")
        .addStringOption(option =>
            option.setName("niveau")
                .setDescription("Priorité souhaitée")
                .setRequired(true)
                .addChoices(
                    { name: "Faible", value: "low" },
                    { name: "Normale", value: "normal" },
                    { name: "Élevée", value: "high" },
                    { name: "Urgente", value: "urgent" }
                )
        ),

    new SlashCommandBuilder()
        .setName("ticket-add")
        .setDescription("Ajouter un membre")
        .addUserOption(option =>
            option.setName("membre")
                .setDescription("Membre à ajouter")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("ticket-remove")
        .setDescription("Retirer un membre")
        .addUserOption(option =>
            option.setName("membre")
                .setDescription("Membre à retirer")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("ticket-rename")
        .setDescription("Renommer un ticket")
        .addStringOption(option =>
            option.setName("nom")
                .setDescription("Nouveau nom")
                .setRequired(true)
                .setMaxLength(90)
        ),

    new SlashCommandBuilder()
        .setName("ticket-transcript")
        .setDescription("Créer une transcription"),

    new SlashCommandBuilder()
        .setName("ticket-note")
        .setDescription("Ajouter une note interne"),

    new SlashCommandBuilder()
        .setName("ticket-stats")
        .setDescription("Afficher les statistiques"),

    new SlashCommandBuilder()
        .setName("ticket-panel")
        .setDescription("Publier le panneau de tickets"),

    new SlashCommandBuilder()
        .setName("ticket-delete")
        .setDescription("Supprimer un ticket")
];

// =====================================================
// EXÉCUTION DES COMMANDES
// =====================================================

async function handleSlashCommand(interaction) {
    const name = interaction.commandName;

    if (name === "ticket") {
        const menu = new StringSelectMenuBuilder()
            .setCustomId("sky_category")
            .setPlaceholder("Choisir une catégorie")
            .addOptions(
                Object.entries(CATEGORIES).map(([value, category]) => ({
                    label: category.label,
                    value,
                    emoji: category.emoji,
                    description: category.description
                }))
            );

        return interaction.reply({
            content: "🎫 **Centre d'assistance SKY RP EH**\nChoisis la catégorie de ta demande.",
            components: [
                new ActionRowBuilder().addComponents(menu)
            ],
            ephemeral: true
        });
    }

    if (name === "ticket-panel") {
        if (!interaction.member.permissions.has(
            PermissionsBitField.Flags.Administrator
        )) {
            return interaction.reply({
                content: "Administrateurs uniquement.",
                ephemeral: true
            });
        }

        await interaction.channel.send(createPanel());

        return interaction.reply({
            content: "✅ Panneau publié.",
            ephemeral: true
        });
    }

    const ticket = getTicket(interaction.channel);

    if (!ticket) {
        return interaction.reply({
            content: "❌ Cette commande doit être utilisée dans un ticket.",
            ephemeral: true
        });
    }

    if (name === "ticket-stats") {
        if (!await requireStaff(interaction)) return;

        const all = Object.values(database.tickets).filter(
            item => item.guildId === interaction.guild.id
        );

        const opened = all.filter(item => item.status === "open").length;
        const closed = all.filter(item => item.status === "closed").length;

        return interaction.reply({
            embeds: [
                createEmbed(
                    "📊 SKY TICKETS • Statistiques",
                    `**Total :** ${all.length}\n**Ouverts :** ${opened}\n**Fermés :** ${closed}`
                )
            ],
            ephemeral: true
        });
    }

    if (name === "ticket-close") {
        if (!isStaff(interaction.member) &&
            (!CONFIG.ALLOW_MEMBER_CLOSE || interaction.user.id !== ticket.ownerId)) {
            return interaction.reply({
                content: "Tu ne peux pas fermer ce ticket.",
                ephemeral: true
            });
        }

        const reason = interaction.options.getString("raison") || "Aucun motif fourni.";

        return closeTicket(interaction, ticket, reason);
    }

    if (!await requireStaff(interaction)) return;

    if (name === "ticket-claim") {
        if (ticket.claimedBy) {
            return interaction.reply({
                content: `Déjà pris en charge par <@${ticket.claimedBy}>.`,
                ephemeral: true
            });
        }

        ticket.claimedBy = interaction.user.id;
        record(ticket, "claimed", interaction.user.id);
        await saveDatabase();

        await updateTicket(interaction, ticket);

        await interaction.reply({
            content: `🙋 ${interaction.user} prend le ticket en charge.`
        });

        await logAction(interaction.guild, "🙋 Ticket pris en charge",
            `${ticket.number} : ${interaction.user.tag}`);

        return;
    }

    if (name === "ticket-priority") {
        const level = interaction.options.getString("niveau");

        ticket.priority = level;
        record(ticket, "priority_changed", interaction.user.id, { level });

        await saveDatabase();
        await updateTicket(interaction, ticket);

        return interaction.reply({
            content: `Priorité modifiée : ${PRIORITIES[level].emoji} ${PRIORITIES[level].label}`,
            ephemeral: true
        });
    }

    if (name === "ticket-add" || name === "ticket-remove") {
        const user = interaction.options.getUser("membre");

        if (user.bot) {
            return interaction.reply({
                content: "Les bots ne peuvent pas être ajoutés comme participants.",
                ephemeral: true
            });
        }

        const adding = name === "ticket-add";

        if (adding && !ticket.participants.includes(user.id)) {
            await interaction.channel.permissionOverwrites.edit(user.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                AttachFiles: true
            });

            ticket.participants.push(user.id);
            record(ticket, "member_added", interaction.user.id, { targetId: user.id });

        } else if (!adding && ticket.participants.includes(user.id)) {
            await interaction.channel.permissionOverwrites.delete(user.id);

            ticket.participants = ticket.participants.filter(id => id !== user.id);
            record(ticket, "member_removed", interaction.user.id, { targetId: user.id });

        } else {
            return interaction.reply({
                content: "Cette opération n'est pas nécessaire.",
                ephemeral: true
            });
        }

        await saveDatabase();

        return interaction.reply({
            content: adding ? `✅ ${user} a été ajouté.` : `✅ ${user} a été retiré.`,
            ephemeral: true
        });
    }

    if (name === "ticket-rename") {
        const newName = interaction.options.getString("nom")
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "-")
            .replace(/-+/g, "-")
            .slice(0, 90);

        if (!newName) {
            return interaction.reply({
                content: "Nom invalide.",
                ephemeral: true
            });
        }

        await interaction.channel.setName(newName);

        record(ticket, "renamed", interaction.user.id, { newName });
        await saveDatabase();

        return interaction.reply({
            content: `✅ Salon renommé : ${newName}`,
            ephemeral: true
        });
    }

    if (name === "ticket-transcript") {
        await interaction.deferReply({ ephemeral: true });

        const transcript = await generateTranscript(interaction.channel);

        return interaction.editReply({
            content: "📄 Transcription générée.",
            files: [transcript]
        });
    }

    if (name === "ticket-note") {
        return createNote(interaction);
    }

    if (name === "ticket-reopen") {
        return reopenTicket(interaction, ticket);
    }

    if (name === "ticket-delete") {
        return deleteTicket(interaction, ticket);
    }
}

// =====================================================
// FERMETURE
// =====================================================

async function closeTicket(interaction, ticket, reason) {
    if (ticket.status === "closed") {
        return interaction.reply({
            content: "Ce ticket est déjà fermé.",
            ephemeral: true
        });
    }

    await interaction.deferReply();

    ticket.status = "closed";
    ticket.closedAt = Date.now();
    ticket.closedBy = interaction.user.id;
    ticket.closeReason = reason;

    record(ticket, "closed", interaction.user.id, { reason });

    await interaction.channel.permissionOverwrites.edit(ticket.ownerId, {
        SendMessages: false
    });

    await saveDatabase();

    await updateTicket(interaction, ticket);

    await interaction.channel.send({
        embeds: [
            createEmbed(
                "🔒 Ticket fermé",
                `**Par :** ${interaction.user}\n**Motif :** ${reason}`,
                CONFIG.COLORS.RED
            )
        ]
    });

    await interaction.editReply("🔒 Ticket fermé.");

    await logAction(
        interaction.guild,
        "🔒 Ticket fermé",
        `**Ticket :** ${ticket.number}\n**Par :** ${interaction.user.tag}\n**Motif :** ${reason}`,
        CONFIG.COLORS.ORANGE
    );
}

// =====================================================
// RÉOUVERTURE
// =====================================================

async function reopenTicket(interaction, ticket) {
    if (!await requireStaff(interaction)) return;

    if (ticket.status !== "closed") {
        return interaction.reply({
            content: "Ce ticket est déjà ouvert.",
            ephemeral: true
        });
    }

    ticket.status = "open";
    ticket.closedAt = null;
    ticket.closedBy = null;

    record(ticket, "reopened", interaction.user.id);

    await interaction.channel.permissionOverwrites.edit(ticket.ownerId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true
    });

    await saveDatabase();

    await updateTicket(interaction, ticket);

    await interaction.reply({
        content: "🔓 Ticket réouvert."
    });

    await logAction(
        interaction.guild,
        "🔓 Ticket réouvert",
        `${ticket.number} par ${interaction.user.tag}`,
        CONFIG.COLORS.GREEN
    );
}

// =====================================================
// SUPPRESSION
// =====================================================

async function deleteTicket(interaction, ticket) {
    if (!await requireStaff(interaction)) return;

    const confirm = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("sky_confirm_delete")
            .setLabel("Confirmer")
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId("sky_cancel_delete")
            .setLabel("Annuler")
            .setStyle(ButtonStyle.Secondary)
    );

    return interaction.reply({
        content: "⚠️ Confirmer définitivement la suppression de ce ticket ?",
        components: [confirm],
        ephemeral: true
    });
}

// =====================================================
// INITIALISATION
// =====================================================

module.exports = {
    name: "sky-tickets",

    commands,

    config: CONFIG,

    init(client) {
        if (initialized.has(client)) return;
        initialized.add(client);

        client.on("interactionCreate", async interaction => {
            try {
                if (interaction.isChatInputCommand()) {
                    if (commands.some(command => command.name === interaction.commandName)) {
                        await handleSlashCommand(interaction);
                    }

                    return;
                }

                if (interaction.isStringSelectMenu() &&
                    interaction.customId === "sky_category") {

                    await createTicket(interaction, interaction.values[0]);
                    return;
                }

                if (!interaction.isButton()) return;

                const ticket = getTicket(interaction.channel);

                if (!ticket) return;

                if (interaction.customId === "sky_close") {
                    if (!isStaff(interaction.member) &&
                        (!CONFIG.ALLOW_MEMBER_CLOSE || interaction.user.id !== ticket.ownerId)) {
                        return interaction.reply({
                            content: "Tu ne peux pas fermer ce ticket.",
                            ephemeral: true
                        });
                    }

                    const modal = new ModalBuilder()
                        .setCustomId("sky_close_modal")
                        .setTitle("Fermeture du ticket");

                    const reason = new TextInputBuilder()
                        .setCustomId("reason")
                        .setLabel("Motif de fermeture")
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                        .setMaxLength(500);

                    modal.addComponents(
                        new ActionRowBuilder().addComponents(reason)
                    );

                    return interaction.showModal(modal);
                }

                if (interaction.customId === "sky_claim") {
                    if (!await requireStaff(interaction)) return;

                    if (ticket.claimedBy) {
                        return interaction.reply({
                            content: "Ce ticket est déjà pris.",
                            ephemeral: true
                        });
                    }

                    ticket.claimedBy = interaction.user.id;

                    record(ticket, "claimed", interaction.user.id);
                    await saveDatabase();

                    await interaction.update({
                        components: getTicketControls(ticket)
                    });

                    await interaction.channel.send({
                        content: `🙋 ${interaction.user} prend ce ticket en charge.`
                    });

                    return;
                }

                if (interaction.customId === "sky_priority") {
                    if (!await requireStaff(interaction)) return;

                    const menu = new StringSelectMenuBuilder()
                        .setCustomId("sky_priority_menu")
                        .setPlaceholder("Choisir une priorité")
                        .addOptions(
                            Object.entries(PRIORITIES).map(([value, item]) => ({
                                label: item.label,
                                value,
                                emoji: item.emoji
                            }))
                        );

                    return interaction.reply({
                        content: "🚦 Choisis une priorité :",
                        components: [
                            new ActionRowBuilder().addComponents(menu)
                        ],
                        ephemeral: true
                    });
                }

                if (interaction.customId === "sky_transcript") {
                    if (!await requireStaff(interaction)) return;

                    await interaction.deferReply({ ephemeral: true });

                    const transcript = await generateTranscript(interaction.channel);

                    return interaction.editReply({
                        content: "📄 Voici la transcription :",
                        files: [transcript]
                    });
                }

                if (interaction.customId === "sky_reopen") {
                    return reopenTicket(interaction, ticket);
                }

                if (interaction.customId === "sky_delete") {
                    return deleteTicket(interaction, ticket);
                }

                if (interaction.customId === "sky_confirm_delete") {
                    if (!await requireStaff(interaction)) return;

                    await interaction.update({
                        content: "🗑️ Suppression en cours...",
                        components: []
                    });

                    await sendTranscript(interaction.channel).catch(console.error);

                    record(ticket, "deleted", interaction.user.id);
                    await saveDatabase();

                    await logAction(
                        interaction.guild,
                        "🗑️ Ticket supprimé",
                        `${ticket.number} par ${interaction.user.tag}`,
                        CONFIG.COLORS.RED
                    );

                    const channel = interaction.channel;

                    delete database.tickets[channel.id];
                    await saveDatabase();

                    return channel.delete("Suppression par le staff");
                }

                if (interaction.customId === "sky_cancel_delete") {
                    return interaction.update({
                        content: "Suppression annulée.",
                        components: []
                    });
                }

            } catch (error) {
                console.error("[SKY TICKETS] Interaction :", error);

                const response = {
                    content: "❌ Une erreur est survenue.",
                    ephemeral: true
                };

                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp(response).catch(() => {});
                } else {
                    await interaction.reply(response).catch(() => {});
                }
            }
        });

        client.on("interactionCreate", async interaction => {
            try {
                if (interaction.isModalSubmit() &&
                    interaction.customId === "sky_close_modal") {

                    const ticket = getTicket(interaction.channel);

                    if (!ticket) {
                        return interaction.reply({
                            content: "Ticket introuvable.",
                            ephemeral: true
                        });
                    }

                    if (!isStaff(interaction.member) &&
                        interaction.user.id !== ticket.ownerId) {
                        return interaction.reply({
                            content: "Action non autorisée.",
                            ephemeral: true
                        });
                    }

                    const reason = interaction.fields.getTextInputValue("reason");

                    await closeTicket(interaction, ticket, reason);
                    return;
                }

                if (interaction.isModalSubmit() &&
                    interaction.customId === "sky_note_modal") {

                    if (!await requireStaff(interaction)) return;

                    const ticket = getTicket(interaction.channel);

                    if (!ticket) return;

                    const note = interaction.fields.getTextInputValue("note");

                    record(ticket, "internal_note", interaction.user.id, { note });
                    await saveDatabase();

                    await interaction.reply({
                        content: "📝 Note interne enregistrée dans l'historique du ticket.",
                        ephemeral: true
                    });

                    await logAction(
                        interaction.guild,
                        "📝 Note interne",
                        `**Ticket :** ${ticket.number}\n**Staff :** ${interaction.user.tag}\n**Note :** ${note}`,
                        CONFIG.COLORS.PURPLE
                    );
                }

                if (interaction.isStringSelectMenu() &&
                    interaction.customId === "sky_priority_menu") {

                    if (!await requireStaff(interaction)) return;

                    const ticket = getTicket(interaction.channel);
                    if (!ticket) return;

                    const level = interaction.values[0];

                    ticket.priority = level;
                    record(ticket, "priority_changed", interaction.user.id, { level });

                    await saveDatabase();

                    await interaction.update({
                        content: `${PRIORITIES[level].emoji} Priorité définie : ${PRIORITIES[level].label}`,
                        components: []
                    });

                    await updateTicket(interaction, ticket);
                }

            } catch (error) {
                console.error("[SKY TICKETS] Modal :", error);
            }
        });

        client.on("messageCreate", async message => {
            if (message.author.bot || !message.guild) return;

            const ticket = getTicket(message.channel);

            if (!ticket || ticket.status !== "open") return;

            ticket.lastActivity = Date.now();
            ticket.messageCount = (ticket.messageCount || 0) + 1;

            await saveDatabase();
        });

        client.on("guildDelete", async guild => {
            console.log(`[SKY TICKETS] Bot retiré de ${guild.name}`);
        });

        console.log("[SKY TICKETS ULTIMATE] Module initialisé.");
    }
};
