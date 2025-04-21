import { Telegraf } from "telegraf";
import userModel from "./src/models/User.js";
import eventModel from "./src/models/Events.js"
import { message } from "telegraf/filters";
import connectDb from "./src/config/db.js";
import { Markup } from "telegraf";
import OpenAI from 'openai';
import fs from 'fs'
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);const bot = new Telegraf(process.env.BOT_TOKEN);

try {
    connectDb();
    console.log("Database Connected Successfully")

} catch {
    console.log(err);
    process.kill(process.pid, 'SIGTERM');
}

//ctx context contains user info
bot.start(async (ctx) => {

    const from = ctx.update.message.from;
    console.log("from ", from);

    try {

        // upsert: updates if record exists, creates if doesnt
        await userModel.findOneAndUpdate({ tgId: from.id },
            {
                $setOnInsert:
                {
                    firstName: from.first_name,
                    lastName: from.last_name,
                    userName: from.username,
                    IsBot: from.is_bot,
                }
            },
            { upsert: true, new: true, });

        //store the userinfo in database

        //reply to user
        console.log(ctx)
        await ctx.reply(`Welcome to BookMarker, Drop any Links to store links in organised manner`)
    } catch (err) {
        console.log(err);
        await ctx.reply("Facing Errors")
    }




})


bot.command('stats', async (ctx) => {
    const from = ctx.update.message.from;

    try {
        // Fetch all events for this user
        const links = await eventModel.find({ tgId: from.id });

        if (links.length === 0) {
            return ctx.reply("You don't have any saved links yet. 🥲");
        }

        const totalLinks = links.length;

        // Get all categories
        const categories = links.map(link => link.category);

        // Unique categories
        const uniqueCategories = new Set(categories);

        // Find most used category
        const categoryFrequency = {};
        categories.forEach(cat => {
            categoryFrequency[cat] = (categoryFrequency[cat] || 0) + 1;
        });

        const mostUsedCategory = Object.entries(categoryFrequency).sort((a, b) => b[1] - a[1])[0][0];

        // Compose the reply
        const replyText = `
📊 *Your Stats*:

- Total Links Saved: *${totalLinks}*
- Categories Used: *${uniqueCategories.size}*
- Most Used Category: *${mostUsedCategory}*
        `;

        ctx.reply(replyText, { parse_mode: "Markdown" });

    } catch (err) {
        console.error(err);
        ctx.reply("Couldn't fetch your stats. Please try again later. ❌");
    }
});

bot.command('mylinks', async (ctx) => {
    const from = ctx.update.message.from;

    try {
        // Fetch all links for this user
        const links = await eventModel.find({ tgId: from.id });

        if (links.length === 0) {
            return ctx.reply("You don't have any saved links yet. 📭");
        }

        // Group links by category
        const linksByCategory = {};

        links.forEach(link => {
            if (!linksByCategory[link.category]) {
                linksByCategory[link.category] = [];
            }
            linksByCategory[link.category].push(link.text);
        });

        let replyText = "*📚 Your Saved Links:*\n\n";

        for (const [category, linksArray] of Object.entries(linksByCategory)) {
            replyText += `*${category}:*\n`;
            linksArray.forEach((link, index) => {
                replyText += `${index + 1}. ${link}\n`;
            });
            replyText += `\n`; // Add extra line after each category
        }

        await ctx.reply(replyText, { parse_mode: "Markdown" });

    } catch (err) {
        console.error(err);
        ctx.reply("Couldn't fetch your links. Please try again later. ❌");
    }
});

// Step 1: Start updatecategory process
bot.command('updatecat', async (ctx) => {
    const from = ctx.update.message.from;
    const messageText = ctx.update.message.text;

    try {
        const args = messageText.replace('/updatecat', '').trim();
        const link = args;

        if (!link) {
            return ctx.reply("❗ Usage: `/updatecat <link>`", { parse_mode: "Markdown" });
        }

        const existingLink = await eventModel.findOne({ text: link, tgId: from.id });

        if (!existingLink) {
            return ctx.reply("❌ Link not found in your saved bookmarks.");
        }

        // Save the link temporarily in session (or easier way: store in callback_data)
        const categories = [
            "YouTube", "Instagram", "Spotify", "Reddit", "X", "Facebook",
            "GitHub", "LinkedIn", "Stack Overflow", "Wikipedia", "Vimeo",
            "Amazon", "Twitch", "Pinterest", "Dropbox", "Flickr", "Quora",
            "TikTok", "Google Drive", "Medium", "Uncategorized"
        ];

        let categoryButtons = categories.map(category => (
            Markup.button.callback(category, `updatecat_${encodeURIComponent(link)}_${encodeURIComponent(category)}`)
        ));
        await ctx.reply('Select a new category for the link:', Markup.inlineKeyboard(categoryButtons, { columns: 3 }));
        // await ctx.reply(`Select a new category for the link:`, Markup.inlineKeyboard(categoryButtons, {columns: 3}));
        
    } catch (err) {
        console.error(err);
        ctx.reply("Something went wrong. Please try again later. ❌");
    }
});

// Step 2: Handle category selection
bot.action(/^updatecat_/, async (ctx) => {
    try {
        const data = ctx.update.callback_query.data;
        const [_, encodedLink, encodedNewCategory] = data.split('_');
        const link = decodeURIComponent(encodedLink);
        const newCategory = decodeURIComponent(encodedNewCategory);
        const from = ctx.update.callback_query.from;

        const existingLink = await eventModel.findOne({ text: link, tgId: from.id });

        if (!existingLink) {
            return ctx.reply("❌ Link not found. Maybe it was already updated or deleted.");
        }

        existingLink.category = newCategory;
        await existingLink.save();

        await ctx.editMessageText(`✅ Link moved to *${newCategory}* category successfully!`, { parse_mode: "Markdown" });

    } catch (err) {
        console.error(err);
        ctx.reply("Something went wrong during update. ❌");
    }
});



// Step 1: Command to start delete
bot.command('delete', async (ctx) => {
    const from = ctx.update.message.from;
    const messageText = ctx.update.message.text;

    try {
        const args = messageText.replace('/delete', '').trim();
        const link = args;

        if (!link) {
            return ctx.reply("❗ Usage: `/delete <link>`", { parse_mode: "Markdown" });
        }

        // Check if link exists
        const existingLink = await eventModel.findOne({ text: link, tgId: from.id });

        if (!existingLink) {
            return ctx.reply("❌ Link not found or already deleted.");
        }

        // Ask for confirmation
        const encodedLink = encodeURIComponent(link);
        await ctx.reply(
            `⚡ Are you sure you want to delete this link?\n${link}`,
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ Yes, Delete', `confirmdelete_${encodedLink}`)],
                [Markup.button.callback('❌ Cancel', `canceldelete_${encodedLink}`)]
            ])
        );

    } catch (err) {
        console.error(err);
        ctx.reply("Something went wrong while preparing delete. ❌");
    }
});

// Step 2: Handle confirmation
bot.action(/^confirmdelete_/, async (ctx) => {
    try {
        const data = ctx.update.callback_query.data;
        const encodedLink = data.replace('confirmdelete_', '');
        const link = decodeURIComponent(encodedLink);
        const from = ctx.update.callback_query.from;

        const deletedLink = await eventModel.findOneAndDelete({ text: link, tgId: from.id });

        if (!deletedLink) {
            return ctx.editMessageText("❌ Link not found or already deleted.");
        }

        await ctx.editMessageText(`✅ Link deleted successfully!`);

    } catch (err) {
        console.error(err);
        ctx.reply("Something went wrong while deleting. ❌");
    }
});

// Step 3: Handle cancellation
bot.action(/^canceldelete_/, async (ctx) => {
    try {
        await ctx.editMessageText("❎ Deletion canceled.");
    } catch (err) {
        console.error(err);
        ctx.reply("Something went wrong while canceling. ❌");
    }
});

bot.command('export', async (ctx) => {
    const from = ctx.update.message.from;

    try {
        const links = await eventModel.find({ tgId: from.id });

        if (!links.length) {
            return ctx.reply("❗ You don't have any saved bookmarks to export.");
        }

        // Build file content
        let fileContent = `📋 Your Saved Bookmarks\n\n`;
        links.forEach((link, index) => {
            fileContent += `${index + 1}. ${link.text} [${link.category || "Uncategorized"}]\n`;
        });

        // Create temporary file
        const fileName = `bookmarks_${from.id}.txt`;
        const filePath = path.join(__dirname, fileName);
        fs.writeFileSync(filePath, fileContent);

        // Send file
        await ctx.replyWithDocument({ source: filePath, filename: fileName });

        // Cleanup (delete file after sending)
        fs.unlinkSync(filePath);

    } catch (err) {
        console.error(err);
        ctx.reply("Something went wrong during export. ❌");
    }
});


// Handle import command (instruct user to upload a .txt file)
bot.command('import', async (ctx) => {
    await ctx.reply("📥 Please send me the `.txt` file containing your exported bookmarks.\n\nMake sure each line is in this format:\n\n`<link> [category]`\n\nExample:\n`https://github.com [GitHub]`\n\nI'll read and save all valid links!", { parse_mode: "Markdown" });
});

// Handle document uploads
bot.on('document', async (ctx) => {
    const from = ctx.update.message.from;
    const document = ctx.update.message.document;

    // Only allow text files
    if (!document.mime_type.startsWith('text/')) {
        return ctx.reply("❗ Please upload a valid `.txt` file.");
    }

    try {
        const fileLink = await ctx.telegram.getFileLink(document.file_id);

        const response = await fetch(fileLink.href);
        const fileContent = await response.text();

        const lines = fileContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);

        let importedCount = 0;
        for (const line of lines) {
            const match = line.match(/(https?:\/\/\S+)\s+\[(.+?)\]/);
            if (match) {
                const link = match[1];
                const category = match[2];

                // Check if already exists
                const existing = await eventModel.findOne({ text: link, tgId: from.id });
                if (!existing) {
                    await eventModel.create({ text: link, category, tgId: from.id });
                    importedCount++;
                }
            }
        }

        await ctx.reply(`✅ Successfully imported ${importedCount} new bookmarks!`);

    } catch (err) {
        console.error(err);
        ctx.reply("Something went wrong while importing. ❌");
    }
});


//creating new command
//command is also a text message, put this on top so that it is caught as a command rather than a simple text message
bot.command('help', async (ctx) => {
    const helpText = `
    Welcome to the BookMarker Bot! Simply send any link (e.g., YouTube, GitHub, Instagram, etc.) to the bot.
   
*Features:*

    1. *Automatic categorization*: The bot will automatically detect the type of link you send and categorize it (e.g., YouTube links go to the "YouTube" category, GitHub links go to the "GitHub" category, etc.).

    2. *Retrieve your links*: You can view your saved links by using the /categories command. Each category will show a list of all the links you've saved under it.

    3. *No duplicates*: If you try to send the same link again, the bot will tell you that it's already stored in the appropriate category.

    4. *Privacy Matters*: your bookmarked links are stored, but not monitored or used by us🤐

    That's it! Made with ❤️. Let me know if you need any more help! 😊
    `;
    await ctx.reply(helpText, { parse_mode: 'Markdown' });
});

bot.command('category', async (ctx) => {
    try {
        const categories = [
            "YouTube", "Instagram", "Spotify", "Reddit", "X", "Facebook",
            "GithHub", "LinkedIn", "Stack Overflow", "Wikipedia", "Vimeo",
            "Amazon", "Twitch", "Pinterest", "Dropbox", "Flickr", "Quora",
            "TikTok", "Google Drive", "Medium", "Uncategorized"
        ];

        let categoryButtons = categories.map(category => ({
            text: category,
            callback_data: `category_${category}`
        }));

        await ctx.reply('Please choose a category:', Markup.inlineKeyboard(categoryButtons, { columns: 3 }));

    } catch (err) {
        console.log(err);
        await ctx.reply("We're facing errors. Kindly try again later.");
    }
});

// Handle category selection
bot.action(/^category_/, async (ctx) => {
    try {
        // Extract the category from the callback data
        const category = ctx.update.callback_query.data.replace('category_', '');

        // Fetch the links for the selected category
        const links = await eventModel.find({ category });

        if (links.length === 0) {
            await ctx.reply(`No links found in the *${category}* category.`);
        } else {
            let message = `Links in the *${category}* category:\n\n`;

            // Prepare the message with the links
            links.forEach((link, index) => {
                message += `${index + 1}. ${link.text}\n`;
            });

            await ctx.reply(message);
        }

        await ctx.answerCbQuery();
    } catch (err) {
        console.log(err);
        await ctx.reply("We're facing errors. Kindly try again later.");
    }
});


bot.on(message('text'), async (ctx) => {

    const from = ctx.update.message.from;
    const messageText = ctx.update.message.text;

    try {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const isLink = urlRegex.test(messageText);

        if (isLink) {
            const url = new URL(messageText); // Parse the link
            let category = "Uncategorized";

            // Categorize based on the domain
            if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
                category = "YouTube";
            } else if (url.hostname.includes('github.com')) {
                category = "GitHub";
            } else if (url.hostname.includes('medium.com')) {
                category = "Medium";
            } else if (url.hostname.includes('reddit.com')) {
                category = "Reddit";
            } else if (url.hostname.includes('twitter.com') || url.hostname.includes('x.com') ) {
                category = "Twitter/X";
            } else if (url.hostname.includes('facebook.com')) {
                category = "Facebook";
            } else if (url.hostname.includes('instagram.com')) {
                category = "Instagram";
            } else if (url.hostname.includes('linkedin.com')) {
                category = "LinkedIn";
            } else if (url.hostname.includes('stackoverflow.com')) {
                category = "Stack Overflow";
            } else if (url.hostname.includes('wikipedia.org')) {
                category = "Wikipedia";
            } else if (url.hostname.includes('vimeo.com')) {
                category = "Vimeo";
            } else if (url.hostname.includes('amazon.com')) {
                category = "Amazon";
            } else if (url.hostname.includes('twitch.tv')) {
                category = "Twitch";
            } else if (url.hostname.includes('pinterest.com')) {
                category = "Pinterest";
            } else if (url.hostname.includes('dropbox.com')) {
                category = "Dropbox";
            } else if (url.hostname.includes('flickr.com')) {
                category = "Flickr";
            } else if (url.hostname.includes('quora.com')) {
                category = "Quora";
            } else if (url.hostname.includes('tiktok.com')) {
                category = "TikTok";
            } else if (url.hostname.includes('drive.google.com')) {
                category = "Google Drive";
            } else if (url.hostname.includes('spotify.com')) {
                category = "Spotify";
            }
            // Add more conditions for other domains as needed

            // Check if the link already exists in the same category
            const existingLink = await eventModel.findOne({ text: messageText, category: category });
            if (existingLink) {
                // If the link already exists, notify the user
                await ctx.reply(`This link is already stored in the *${category}* category.`);
            } else {
                // Save the new link to the database under the appropriate category
                await eventModel.create({
                    text: messageText,
                    category: category,
                    tgId: from.id,
                });

                await ctx.reply(`Link stored in the *${category}* category.`);
            }
        } else {
            // Handle non-link messages
            await ctx.reply("This doesn't look like a valid link. Please send a valid link to store.");
        }

    } catch (err) {
        console.log(err);
        await ctx.reply("We're facing errors. Kindly try again later.");
    }

});




// Handle /category command to list links in each category









try {
    await connectDb();
    console.log("Database Connected Successfully");
    bot.launch();
} catch (err) {
    console.error(err);
    process.exit(1); // Exit process with failure
}


// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))