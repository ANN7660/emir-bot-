const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const express = require('express');

// Configuration du bot
const PREFIX = '!';
const PORT = process.env.PORT || 3000;

// Serveur web pour Render (keep-alive)
const app = express();

app.get('/', (req, res) => {
    res.send('✅ Bot Discord est en ligne !');
});

app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`🌐 Serveur web démarré sur le port ${PORT}`);
});

// Client Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Stockage des configurations par serveur
const serverConfigs = new Map();

// Fonction pour obtenir la config d'un serveur
function getServerConfig(guildId) {
    if (!serverConfigs.has(guildId)) {
        serverConfigs.set(guildId, {
            welcomeMessage: 'BVN {user} sur {server} ! Nous sommes maintenant {count} membres.',
            welcomeChannelId: null
        });
    }
    return serverConfigs.get(guildId);
}

// Fonction pour formater le message de bienvenue
function formatWelcomeMessage(message, member, guild) {
    return message
        .replace('{user}', `<@${member.id}>`)
        .replace('{server}', guild.name)
        .replace('{count}', guild.memberCount);
}

// Événement : Bot prêt
client.once('ready', () => {
    console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
    console.log(`📊 Sur ${client.guilds.cache.size} serveur(s)`);
});

// Événement : Nouveau membre
client.on('guildMemberAdd', async (member) => {
    const config = getServerConfig(member.guild.id);
    
    // Chercher un salon approprié si aucun n'est configuré
    let welcomeChannel = null;
    
    if (config.welcomeChannelId) {
        welcomeChannel = member.guild.channels.cache.get(config.welcomeChannelId);
    }
    
    // Sinon, chercher un salon nommé "bienvenue", "général", "general", "welcome", etc.
    if (!welcomeChannel) {
        welcomeChannel = member.guild.channels.cache.find(ch => 
            ch.name.match(/bienvenue|général|general|welcome|accueil/) && 
            ch.permissionsFor(client.user).has(PermissionFlagsBits.SendMessages)
        );
    }
    
    // Sinon, prendre le premier salon où le bot peut écrire
    if (!welcomeChannel) {
        welcomeChannel = member.guild.channels.cache.find(ch =>
            ch.isTextBased() &&
            ch.permissionsFor(client.user).has(PermissionFlagsBits.SendMessages)
        );
    }
    
    if (welcomeChannel) {
        const welcomeMsg = formatWelcomeMessage(config.welcomeMessage, member, member.guild);
        try {
            await welcomeChannel.send(welcomeMsg);
        } catch (error) {
            console.error('Erreur lors de l\'envoi du message de bienvenue:', error);
        }
    }
});

// Événement : Messages
client.on('messageCreate', async (message) => {
    // Ignorer les bots et les messages sans préfixe
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;
    
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    // Commande !help
    if (command === 'help') {
        const embed = {
            color: 0x5865F2,
            title: '📚 Commandes du Bot',
            fields: [
                {
                    name: '👋 Bienvenue',
                    value: '`!bvntest` - Tester le message de bienvenue\n`!bvnmsg <message>` - Configurer le message (Modérateurs uniquement)'
                },
                {
                    name: '🔒 Modération',
                    value: '`!lock` - Verrouiller le salon actuel\n`!unlock` - Déverrouiller le salon actuel'
                },
                {
                    name: '📝 Variables disponibles',
                    value: '`{user}` - Mention du membre\n`{server}` - Nom du serveur\n`{count}` - Nombre de membres'
                },
                {
                    name: '💡 Exemple',
                    value: '`!bvnmsg Salut {user} ! Bienvenue sur {server} 🎉`'
                }
            ],
            footer: {
                text: 'Utilisez ! comme préfixe pour toutes les commandes'
            }
        };
        
        return message.reply({ embeds: [embed] });
    }
    
    // Commande !bvntest
    if (command === 'bvntest') {
        const config = getServerConfig(message.guild.id);
        const testMsg = formatWelcomeMessage(config.welcomeMessage, message.member, message.guild);
        
        return message.reply({
            content: '🧪 **Test du message de bienvenue :**\n' + testMsg,
            allowedMentions: { parse: [] } // Évite de mentionner réellement
        });
    }
    
    // Commande !bvnmsg (réservée aux modérateurs)
    if (command === 'bvnmsg') {
        // Vérifier les permissions
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('❌ Vous devez avoir la permission "Gérer le serveur" pour utiliser cette commande.');
        }
        
        const newMessage = args.join(' ');
        
        if (!newMessage) {
            return message.reply('❌ Veuillez fournir un message.\n**Exemple :** `!bvnmsg BVN {user} sur {server} !`');
        }
        
        const config = getServerConfig(message.guild.id);
        config.welcomeMessage = newMessage;
        
        // Définir le salon actuel comme salon de bienvenue
        config.welcomeChannelId = message.channel.id;
        
        const preview = formatWelcomeMessage(newMessage, message.member, message.guild);
        
        return message.reply({
            content: `✅ **Message de bienvenue configuré !**\n\n**Aperçu :**\n${preview}\n\n*Les messages de bienvenue seront envoyés dans ce salon.*`,
            allowedMentions: { parse: [] }
        });
    }
    
    // Commande !lock
    if (command === 'lock') {
        // Vérifier les permissions
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply('❌ Vous devez avoir la permission "Gérer les salons" pour utiliser cette commande.');
        }
        
        const channel = message.channel;
        const everyoneRole = message.guild.roles.everyone;
        
        try {
            await channel.permissionOverwrites.edit(everyoneRole, {
                SendMessages: false
            });
            
            return message.reply('🔒 **Salon verrouillé !** Les membres ne peuvent plus envoyer de messages.');
        } catch (error) {
            console.error('Erreur lors du verrouillage:', error);
            return message.reply('❌ Erreur lors du verrouillage du salon. Vérifiez que le bot a les permissions nécessaires.');
        }
    }
    
    // Commande !unlock
    if (command === 'unlock') {
        // Vérifier les permissions
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply('❌ Vous devez avoir la permission "Gérer les salons" pour utiliser cette commande.');
        }
        
        const channel = message.channel;
        const everyoneRole = message.guild.roles.everyone;
        
        try {
            await channel.permissionOverwrites.edit(everyoneRole, {
                SendMessages: null
            });
            
            return message.reply('🔓 **Salon déverrouillé !** Les membres peuvent à nouveau envoyer des messages.');
        } catch (error) {
            console.error('Erreur lors du déverrouillage:', error);
            return message.reply('❌ Erreur lors du déverrouillage du salon. Vérifiez que le bot a les permissions nécessaires.');
        }
    }
});

// Gestion des erreurs
client.on('error', error => {
    console.error('Erreur du client Discord:', error);
});

process.on('unhandledRejection', error => {
    console.error('Erreur non gérée:', error);
});

// Connexion du bot
const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
    console.error('❌ DISCORD_TOKEN manquant dans les variables d\'environnement !');
    process.exit(1);
}

client.login(TOKEN);
