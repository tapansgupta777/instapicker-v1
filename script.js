   document.addEventListener('DOMContentLoaded', () => {
       // API key for Apify - hardcoded for simplicity in this demo
       const API_KEY = 'apify_api_kizrZrYx87YfMJ1ULhzCj8Mb4tpAsq3csYQV';

       // PRE-SELECTED WINNERS: Add usernames here to guarantee they'll be selected as winners
       // Leave as empty array [] for normal random selection
       // If there are more names here than winners requested, it will randomly select from this list
       // If there are fewer names here than winners requested, remaining winners will be random
       const GUARANTEED_WINNERS = [ 'tapan'
           // Add usernames here (with or without @)
           // 'username1',
           // 'username2', 
           // '@username3'
       ];

       // DOM Elements
       const fetchBtn = document.getElementById('fetch-btn');
       const instagramUrlInput = document.getElementById('instagram-url');
       const loadingElement = document.getElementById('loading');
       const errorMessageElement = document.getElementById('error-message');
       const commentsContainer = document.getElementById('comments-container');
       const commentsCountElement = document.getElementById('comments-count');
       const noCommentsElement = document.getElementById('no-comments');
       const postInfoElement = document.getElementById('post-info');
       const postAuthorElement = document.getElementById('post-author');
       const postAuthorAvatarElement = document.getElementById('post-author-avatar');
       const postCaptionElement = document.getElementById('post-caption');
       const postLikesElement = document.getElementById('post-likes');
       const postCommentsCountElement = document.getElementById('post-comments-count');

       // Giveaway Elements
       const giveawayControlsElement = document.getElementById('giveaway-controls');
       const winnersCountInput = document.getElementById('winners-count');
       const selectWinnersBtn = document.getElementById('select-winners-btn');
       const winnersContainer = document.getElementById('winners-container');
       const winnersListElement = document.getElementById('winners-list');
       const confettiCanvas = document.getElementById('confetti-canvas');

       // Store fetched comments globally for winner selection
       let fetchedComments = [];

       // Event Listeners
       fetchBtn.addEventListener('click', fetchComments);
       instagramUrlInput.addEventListener('keydown', (e) => {
           if (e.key === 'Enter') {
               fetchComments();
           }
       });

       // Add event listener for the select winners button
       selectWinnersBtn.addEventListener('click', selectRandomWinners);

       // Handle API errors with detailed messages
       function handleApiError(error, response) {
           console.error('API Error:', error);
           let errorMessage = 'Failed to fetch comments. ';

           if (response) {
               try {
                   errorMessage += `Status: ${response.status} - ${response.statusText}`;
               } catch (e) {
                   errorMessage += 'Unknown error occurred.';
               }
           } else {
               errorMessage += error.message || 'Unknown error occurred.';
           }

           showError(errorMessage);
       }

       // Main function to fetch comments
       async function fetchComments() {
           const instagramUrl = instagramUrlInput.value.trim();

           if (!instagramUrl) {
               showError('Please enter an Instagram post URL');
               return;
           }

           if (!isValidInstagramUrl(instagramUrl)) {
               showError('Please enter a valid Instagram post or reel URL (e.g., https://www.instagram.com/p/ABC123/ or https://www.instagram.com/reel/XYZ789/)');
               return;
           }

           // Reset previous results
           commentsContainer.innerHTML = '';
           winnersListElement.innerHTML = '';
           hideError();
           showLoading();
           noCommentsElement.style.display = 'none';
           postInfoElement.style.display = 'none';
           winnersContainer.style.display = 'none';

           // Clear previous comments
           fetchedComments = [];

           // Show the giveaway controls immediately
           giveawayControlsElement.style.display = 'block';

           // Start fetching in the background
           fetchCommentsInBackground(instagramUrl);
       }

       // Fetch comments in the background
       async function fetchCommentsInBackground(instagramUrl) {
           try {
               // Don't show loading indicator to the user
               // Instead, let them interact with the giveaway controls immediately
               hideLoading();

               // First, start the scraper run
               const startRunResponse = await startApifyRun(instagramUrl);
               console.log('Run started:', startRunResponse);

               if (!startRunResponse.data || !startRunResponse.data.id) {
                   throw new Error('Invalid response from Apify API');
               }

               const runId = startRunResponse.data.id;

               // Update giveaway info text to be clean and simple
               const giveawayInfoText = document.querySelector('.giveaway-info span');
               giveawayInfoText.innerHTML = `Enter how many winners you want to pick.`;

               // Poll for completion
               const runData = await pollForRunCompletion(runId);
               console.log('Run completed:', runData);

               if (runData.status === 'SUCCEEDED') {
                   // Get the dataset items
                   const datasetId = runData.defaultDatasetId;
                   const comments = await getDatasetItems(datasetId);

                   // Store comments for winner selection
                   // Use a universal parser for both reels and posts
                   fetchedComments = comments
                       .filter(item => {
                           // Keep only items that have at least username and text
                           const hasUsername = item.ownerUsername || item.username || 
                                           (item.owner && item.owner.username) || 
                                           (item.commenter && item.commenter.username);
                           const hasText = item.text || item.comment || item.content;
                           return hasUsername && hasText;
                       })
                       .map(item => {
                           // Process profile picture with careful validation
                           let profilePic = null;

                           // Try to get the profile picture from various possible locations
                           if (item.profilePicture && typeof item.profilePicture === 'string' && 
                               item.profilePicture.startsWith('http')) {
                               profilePic = item.profilePicture;
                           } else if (item.owner && item.owner.profilePicUrl && 
                                   typeof item.owner.profilePicUrl === 'string' && 
                                   item.owner.profilePicUrl.startsWith('http')) {
                               profilePic = item.owner.profilePicUrl;
                           } else if (item.commenter && item.commenter.profilePicUrl && 
                                   typeof item.commenter.profilePicUrl === 'string' && 
                                   item.commenter.profilePicUrl.startsWith('http')) {
                               profilePic = item.commenter.profilePicUrl;
                           }

                           // Clean up any null or undefined string values
                           if (profilePic === 'null' || profilePic === 'undefined') {
                               profilePic = null;
                           }

                           // Return a normalized comment object with consistent structure and ensure @ prefix
                           let username = item.ownerUsername || item.username || 
                                       (item.owner ? item.owner.username : null) || 
                                       (item.commenter ? item.commenter.username : 'Unknown');
                           
                           // Ensure username has @ prefix
                           if (username && !username.startsWith('@')) {
                               username = '@' + username;
                           }
                           
                           return {
                               ownerUsername: username,
                               text: item.text || item.comment || item.content || 'No comment text',
                               likesCount: item.likesCount || item.likes || 0,
                               timestamp: item.timestamp || item.date || item.created || null,
                               profilePicture: profilePic,
                               ownerPost: item.ownerPost || null
                           };
                       });

                   if (fetchedComments.length === 0) {
                       giveawayControlsElement.style.display = 'none';
                       noCommentsElement.style.display = 'block';
                       hideSelectingAnimation();
                       return;
                   }

                   // Keep the giveaway info text clean and simple - no mention of comments counts
                   giveawayInfoText.innerHTML = `Ready to pick winners!`;

                   // Extract post information from the first comment's ownerPost field
                   const firstItem = comments[0];
                   if (firstItem && firstItem.ownerPost) {
                       displayPostInfo(firstItem.ownerPost);
                   }

                   // Don't show success notification to avoid duplicate messages

                   // Pulse the select winners button to indicate readiness
                   selectWinnersBtn.classList.add('pulse-button');

                   // Check if user already clicked the select winners button
                   const savedWinnerCount = selectWinnersBtn.getAttribute('data-winner-count');
                   if (savedWinnerCount) {
                       // User already clicked, so auto-select winners
                       console.log('Auto-selecting winners with count:', savedWinnerCount);

                       // Small delay to ensure UI is updated
                       setTimeout(async () => {
                           // Hide any existing selecting animation first
                           hideSelectingAnimation();

                           // Get the desired number of winners
                           const count = parseInt(savedWinnerCount);

                           // Show selecting animation
                           showSelectingAnimation();

                           // No dramatic pause as per user request

                           // Limit the number of winners to the number of comments
                           const actualCount = Math.min(count, fetchedComments.length);

                           // Select random winners
                           const winners = selectRandomItems(fetchedComments, actualCount);

                           // Display winners
                           displayWinners(winners);

                           // Hide giveaway controls
                           giveawayControlsElement.style.display = 'none';

                           // Start confetti animation
                           startConfetti();
                       }, 500);
                   } else {
                       // Enable the button and input if they were disabled
                       selectWinnersBtn.disabled = false;
                       winnersCountInput.disabled = false;
                   }

               } else {
                   giveawayControlsElement.style.display = 'none';
                   hideSelectingAnimation();
                   showNotification(`The scraper failed with status: ${runData.status}. Please try again later.`, 'error');
               }
           } catch (error) {
               console.error('Error:', error);

               giveawayControlsElement.style.display = 'none';
               hideSelectingAnimation();
               // Display more informative error message
               showNotification('Error fetching comments: ' + error.message, 'error');
           }
       }

       // Select random winners from the fetched comments
       async function selectRandomWinners() {
           // Stop the button pulse animation
           selectWinnersBtn.classList.remove('pulse-button');

           // Get the number of winners
           const count = parseInt(winnersCountInput.value);

           // Validate input
           if (isNaN(count) || count < 1) {
               showNotification('Please enter a valid number of winners (at least 1)', 'error');
               return;
           }

           // If comments are still loading, show a special selecting state
           if (!fetchedComments || fetchedComments.length === 0) {
               // Show the selecting winners animation
               showSelectingAnimation();

               // Store the winner count for when the comments are loaded
               selectWinnersBtn.setAttribute('data-winner-count', count);
               selectWinnersBtn.disabled = true;
               winnersCountInput.disabled = true;

               // Add a clean message without spinner
               const giveawayInfoText = document.querySelector('.giveaway-info span');
               giveawayInfoText.innerHTML = `<strong>${count}</strong> winner(s) will be selected as soon as comments load.`;

               return;
           }

           // Show selecting animation
           showSelectingAnimation();

           // Limit the number of winners to the number of comments
           const actualCount = Math.min(count, fetchedComments.length);

           // No delay as per user request

           // Select random winners
           const winners = selectRandomItems(fetchedComments, actualCount);

           // Display winners
           displayWinners(winners);

           // Hide giveaway controls
           giveawayControlsElement.style.display = 'none';

           // Start confetti animation
           startConfetti();
       }

       // Show selecting animation while winners are being picked with casino-style slot machine effect
       function showSelectingAnimation() {
           // Create or get the selecting overlay
           let selectingOverlay = document.getElementById('selecting-overlay');
           if (!selectingOverlay) {
               selectingOverlay = document.createElement('div');
               selectingOverlay.id = 'selecting-overlay';
               document.body.appendChild(selectingOverlay);
           }

           // Create a more exciting, casino-style slot machine animation
           selectingOverlay.innerHTML = `
               <div class="selecting-content">
                   <div class="selecting-spinner"></div>
                   <h2>Finding Winners!</h2>
                   <div class="slot-machine">
                       <div class="slot-window">
                           <div class="username-slot">@</div>
                       </div>
                   </div>
                   <p class="magic-text">Magic happening!</p>
               </div>
           `;

           // Show the overlay
           selectingOverlay.style.display = 'flex';

           // Create a random username generator for the slot machine effect
           const characters = 'abcdefghijklmnopqrstuvwxyz0123456789_.';
           const usernameSlot = document.querySelector('.username-slot');
           const usernamePrefixes = ['user_', 'insta', 'happy', 'cool', 'super', 'awesome', 'best', 'love', 'life', 'photo'];
           const usernameSegments = ['photo', 'gram', 'lover', 'fan', 'world', 'star', 'top', 'best', 'official', 'real'];

           // Slot machine effect for usernames
           const slotInterval = setInterval(() => {
               // Generate a random Instagram-like username
               const prefix = usernamePrefixes[Math.floor(Math.random() * usernamePrefixes.length)];
               const segment = usernameSegments[Math.floor(Math.random() * usernameSegments.length)];
               const randomNum = Math.floor(Math.random() * 1000);

               // Create a realistic-looking username
               const randomUsername = `@${prefix}${segment}${randomNum}`;

               // Add some random characters at the end for a glitchy effect
               const glitchChars = characters.charAt(Math.floor(Math.random() * characters.length)) + 
                                 characters.charAt(Math.floor(Math.random() * characters.length));

               // Update the slot with the random username
               usernameSlot.textContent = randomUsername + glitchChars;

               // Add a flash effect
               usernameSlot.classList.add('flash');
               setTimeout(() => {
                   usernameSlot.classList.remove('flash');
               }, 50);

           }, 100); // Fast speed for exciting slot machine effect

           // Generate random emojis around the text for extra excitement
           const magicText = document.querySelector('.magic-text');
           const emojis = ['✨', '🎉', '🎊', '🔮', '⭐', '🌟', '💫', '🎯', '🎪', '🎰'];
           const emojiInterval = setInterval(() => {
               // Pick random emojis
               const emoji1 = emojis[Math.floor(Math.random() * emojis.length)];
               const emoji2 = emojis[Math.floor(Math.random() * emojis.length)];

               // Update the text with random emojis
               magicText.innerHTML = `${emoji1} Magic happening! ${emoji2}`;
           }, 500);

           // Store the interval IDs for later cleanup
           selectingOverlay.setAttribute('data-slot-interval', slotInterval);
           selectingOverlay.setAttribute('data-emoji-interval', emojiInterval);

           // Return a function to hide the overlay
           return () => {
               clearInterval(slotInterval);
               clearInterval(emojiInterval);
               selectingOverlay.style.display = 'none';
           };
       }

       // Hide selecting animation
       function hideSelectingAnimation() {
           const selectingOverlay = document.getElementById('selecting-overlay');
           if (selectingOverlay) {
               // Clear all animation intervals
               const slotIntervalId = parseInt(selectingOverlay.getAttribute('data-slot-interval'));
               if (!isNaN(slotIntervalId)) {
                   clearInterval(slotIntervalId);
               }

               const emojiIntervalId = parseInt(selectingOverlay.getAttribute('data-emoji-interval'));
               if (!isNaN(emojiIntervalId)) {
                   clearInterval(emojiIntervalId);
               }

               // For backward compatibility
               const intervalId = parseInt(selectingOverlay.getAttribute('data-interval'));
               if (!isNaN(intervalId)) {
                   clearInterval(intervalId);
               }

               // Hide the overlay with a fade effect
               selectingOverlay.style.opacity = '1';
               selectingOverlay.style.transition = 'opacity 0.5s ease';
               selectingOverlay.style.opacity = '0';

               // Immediately hide the overlay without transition delay
               selectingOverlay.style.display = 'none';
               selectingOverlay.style.opacity = '1';
           }
       }

       // Show a notification
       function showNotification(message, type = 'info') {
           // Create a notification element
           const notification = document.createElement('div');
           notification.className = `notification ${type}`;
           notification.innerHTML = `
               <div class="notification-content">
                   <i class="fas ${type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
                   <span>${message}</span>
               </div>
           `;

           // Add to the document
           document.body.appendChild(notification);

           // Animate in
           setTimeout(() => {
               notification.classList.add('show');
           }, 10);

           // Remove after a delay
           setTimeout(() => {
               notification.classList.remove('show');
               setTimeout(() => {
                   notification.remove();
               }, 300);
           }, 3000);
       }

       // Validate Instagram URL format
       function isValidInstagramUrl(url) {
           // Regular expression to validate both post and reel URLs
           const regex = /^https?:\/\/(www\.)?instagram\.com\/(p|reel)\/[\w-]+\/?/;
           return regex.test(url);
       }

       // Start the Apify scraper run
       async function startApifyRun(instagramUrl) {
           // Use a single scraper for both post and reel URLs for better compatibility
           const scraper = 'apify~instagram-scraper';

           // Configure the body to work with both posts and reels
           const body = JSON.stringify({
               "directUrls": [instagramUrl],
               "resultsType": "comments",
               "resultsLimit": 300,
               "maxRequestRetries": 5,
               "proxy": {
                   "useApifyProxy": true
               }
           });

           const response = await fetch(`https://api.apify.com/v2/acts/${scraper}/runs?token=${API_KEY}`, {
               method: 'POST',
               headers: {
                   'Content-Type': 'application/json'
               },
               body: body
           });

           if (!response.ok) {
               throw new Error(`Failed to start the scraper. Status: ${response.status}`);
           }

           return response.json();
       }

       // Poll for run completion
       async function pollForRunCompletion(runId) {
           const maxAttempts = 30;
           const delayMs = 5000; // 5 seconds

           for (let attempt = 0; attempt < maxAttempts; attempt++) {
               try {
                   const response = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${API_KEY}`);

                   if (!response.ok) {
                       throw new Error(`API returned status ${response.status}: ${response.statusText}`);
                   }

                   const data = await response.json();

                   if (!data || !data.data) {
                       throw new Error('Invalid response format from Apify API');
                   }

                   const runData = data.data;

                   if (runData.status === 'SUCCEEDED' || runData.status === 'FAILED' || runData.status === 'ABORTED') {
                       return runData;
                   }

                   // Wait before polling again
                   await new Promise(resolve => setTimeout(resolve, delayMs));
               } catch (error) {
                   console.error('Error polling for status:', error);
                   // Wait before retrying
                   await new Promise(resolve => setTimeout(resolve, delayMs));
               }
           }

           throw new Error('Timed out waiting for the scraper to complete');
       }

       // Get dataset items
       async function getDatasetItems(datasetId) {
           try {
               const response = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${API_KEY}`);

               if (!response.ok) {
                   throw new Error(`Failed to get dataset items: ${response.status}`);
               }

               return await response.json();
           } catch (error) {
               console.error('Error fetching dataset:', error);
               throw error;
           }
       }

       // Display comments in the UI
       function displayComments(data) {
           commentsContainer.innerHTML = '';

           // Update comments count
           commentsCountElement.textContent = `${data.length} comments`;

           data.forEach(comment => {
               const commentElement = createCommentElement(comment);
               commentsContainer.appendChild(commentElement);
           });
       }

       // Display post information
       function displayPostInfo(postData) {
           // Set the author name
           postAuthorElement.textContent = postData.author || 'Unknown';

           // Set the author avatar if available
           if (postData.authorAvatar) {
               postAuthorAvatarElement.innerHTML = `<img src="${postData.authorAvatar}" alt="${postData.author}">`;
           } else {
               // If no avatar, show the first letter of the author name as a placeholder
               const authorInitial = (postData.author || 'U').charAt(0).toUpperCase();
               postAuthorAvatarElement.innerHTML = `<div class="avatar-placeholder">${authorInitial}</div>`;
           }

           // Set the caption
           postCaptionElement.textContent = postData.caption || 'No caption';

           // Set likes and comments count
           postLikesElement.textContent = postData.likes ? `${postData.likes} likes` : '0 likes';
           postCommentsCountElement.textContent = `${fetchedComments.length} comments`;

           // Display the post info element
           postInfoElement.style.display = 'block';
       }

       // Create a comment element
       function createCommentElement(comment) {
           const commentDiv = document.createElement('div');
           commentDiv.className = 'comment';

           // Avatar section with improved image handling
           const avatarDiv = document.createElement('div');
           avatarDiv.className = 'comment-avatar';

           if (comment.profilePicture && typeof comment.profilePicture === 'string' && comment.profilePicture.startsWith('http')) {
               const img = document.createElement('img');
               img.src = comment.profilePicture;
               img.alt = comment.ownerUsername;
               img.onerror = function() {
                   // If image fails to load, replace with initial
                   this.parentNode.textContent = comment.ownerUsername.charAt(0).toUpperCase();
               };
               avatarDiv.appendChild(img);
           } else {
               // If no profile picture, display the first letter of the username
               const initial = comment.ownerUsername.charAt(0).toUpperCase();
               avatarDiv.textContent = initial;
           }

           // Comment content section
           const contentDiv = document.createElement('div');
           contentDiv.className = 'comment-content';

           // Username
           const usernameDiv = document.createElement('div');
           usernameDiv.className = 'comment-username';
           usernameDiv.textContent = comment.ownerUsername;
           contentDiv.appendChild(usernameDiv);

           // Comment text
           const textDiv = document.createElement('div');
           textDiv.className = 'comment-text';
           textDiv.textContent = comment.text;
           contentDiv.appendChild(textDiv);

           // Comment likes
           if (comment.likesCount) {
               const likesDiv = document.createElement('div');
               likesDiv.className = 'comment-likes';
               likesDiv.textContent = `${comment.likesCount} likes`;
               contentDiv.appendChild(likesDiv);
           }

           // Comment date if available
           if (comment.timestamp) {
               const dateDiv = document.createElement('div');
               dateDiv.className = 'comment-date';
               dateDiv.textContent = formatDate(comment.timestamp);
               contentDiv.appendChild(dateDiv);
           }

           // Append avatar and content to the comment div
           commentDiv.appendChild(avatarDiv);
           commentDiv.appendChild(contentDiv);

           return commentDiv;
       }

       // Format date helper
       function formatDate(date) {
           try {
               // Try to parse the date string to a Date object
               const dateObj = new Date(date);

               // Check if the date is valid
               if (isNaN(dateObj.getTime())) {
                   return 'Invalid date';
               }

               // Format the date in a user-friendly way
               return dateObj.toLocaleDateString(undefined, {
                   year: 'numeric',
                   month: 'short',
                   day: 'numeric',
                   hour: '2-digit',
                   minute: '2-digit'
               });
           } catch (e) {
               // If any error occurs during parsing, return the original string
               return date;
           }
       }

       // Select random items from an array with support for guaranteed winners
       function selectRandomItems(array, count) {
           // Create a copy of the array to avoid modifying the original
           const arrayCopy = [...array];
           const results = [];

           // Process guaranteed winners first if there are any
           if (GUARANTEED_WINNERS && GUARANTEED_WINNERS.length > 0) {
               console.log('Using guaranteed winners list:', GUARANTEED_WINNERS);

               // Normalize the guaranteed usernames (remove @ if present)
               const normalizedGuaranteedWinners = GUARANTEED_WINNERS.map(name => {
                   return name.startsWith('@') ? name.substring(1) : name;
               });

               // If we have more guaranteed winners than requested count,
               // randomly select from the guaranteed winners list
               if (normalizedGuaranteedWinners.length > count) {
                   const guaranteedWinnersCopy = [...normalizedGuaranteedWinners];
                   const selectedGuaranteedWinners = [];

                   // Randomly select from guaranteed winners
                   for (let i = 0; i < count; i++) {
                       const randomIndex = Math.floor(Math.random() * guaranteedWinnersCopy.length);
                       selectedGuaranteedWinners.push(guaranteedWinnersCopy[randomIndex]);
                       guaranteedWinnersCopy.splice(randomIndex, 1);
                   }

                   // Find comments matching the selected guaranteed usernames
                   for (const winnerName of selectedGuaranteedWinners) {
                       // Find a matching comment
                       const matchIndex = arrayCopy.findIndex(comment => {
                           const commentUsername = comment.ownerUsername.startsWith('@') 
                               ? comment.ownerUsername.substring(1) 
                               : comment.ownerUsername;
                           return commentUsername.toLowerCase() === winnerName.toLowerCase();
                       });

                       if (matchIndex !== -1) {
                           // Add the found comment to results
                           results.push(arrayCopy[matchIndex]);
                           // Remove it from the array copy to avoid duplicates
                           arrayCopy.splice(matchIndex, 1);
                       } else {
                           // If the guaranteed username isn't found in comments,
                           // create a synthetic comment object for that username
                           results.push({
                               ownerUsername: winnerName.startsWith('@') ? winnerName : '@' + winnerName,
                               text: 'Selected winner! 🎉',
                               likesCount: Math.floor(Math.random() * 50) + 1,
                               timestamp: new Date().toISOString(),
                               profilePicture: null
                           });
                       }
                   }

                   // We've filled all requested winners from the guaranteed list
                   return results;
               } else {
                   // We have fewer or equal guaranteed winners than requested count

                   // First add all guaranteed winners
                   for (const winnerName of normalizedGuaranteedWinners) {
                       // Find a matching comment
                       const matchIndex = arrayCopy.findIndex(comment => {
                           const commentUsername = comment.ownerUsername.startsWith('@') 
                               ? comment.ownerUsername.substring(1) 
                               : comment.ownerUsername;
                           return commentUsername.toLowerCase() === winnerName.toLowerCase();
                       });

                       if (matchIndex !== -1) {
                           // Add the found comment to results
                           results.push(arrayCopy[matchIndex]);
                           // Remove it from the array copy to avoid duplicates
                           arrayCopy.splice(matchIndex, 1);
                       } else {
                           // If the guaranteed username isn't found in comments,
                           // create a synthetic comment object for that username
                           results.push({
                               ownerUsername: winnerName.startsWith('@') ? winnerName : '@' + winnerName,
                               text: 'Selected winner! 🎉',
                               likesCount: Math.floor(Math.random() * 50) + 1,
                               timestamp: new Date().toISOString(),
                               profilePicture: null
                           });
                       }
                   }

                   // Calculate how many more winners we need
                   const remainingCount = count - results.length;

                   // If we need more winners, select randomly from remaining comments
                   if (remainingCount > 0 && arrayCopy.length > 0) {
                       // Check if we need more items than are available
                       if (remainingCount >= arrayCopy.length) {
                           results.push(...arrayCopy);
                           return results;
                       }

                       // Randomly select remaining items
                       for (let i = 0; i < remainingCount; i++) {
                           const randomIndex = Math.floor(Math.random() * arrayCopy.length);
                           results.push(arrayCopy[randomIndex]);
                           arrayCopy.splice(randomIndex, 1);
                       }
                   }

                   return results;
               }
           }

           // No guaranteed winners, use the original random selection logic
           // Check if we need more items than are available
           if (count >= arrayCopy.length) {
               return arrayCopy;
           }

           // Randomly select items until we have the desired count
           for (let i = 0; i < count; i++) {
               // Generate a random index within the remaining array
               const randomIndex = Math.floor(Math.random() * arrayCopy.length);

               // Add the selected item to results
               results.push(arrayCopy[randomIndex]);

               // Remove the selected item from the copy to avoid duplicates
               arrayCopy.splice(randomIndex, 1);
           }

           return results;
       }

       // Display winners in the UI
       function displayWinners(winners) {
           // Hide the selecting animation
           hideSelectingAnimation();

           // Clear any existing winners
           winnersListElement.innerHTML = '';

           // Add each winner to the list
           winners.forEach((winner, index) => {
               const winnerCard = document.createElement('div');
               winnerCard.className = 'winner-card';
               // Add a slight delay for each winner to create a staggered animation effect
               winnerCard.style.animationDelay = `${index * 0.2}s`;

               // Create avatar
               const avatarDiv = document.createElement('div');
               avatarDiv.className = 'winner-avatar';

               if (winner.profilePicture && typeof winner.profilePicture === 'string' && 
                   winner.profilePicture.startsWith('http') && winner.profilePicture !== 'null') {
                   // Create an image element for the profile picture with strict validation
                   const img = document.createElement('img');
                   img.src = winner.profilePicture;
                   img.alt = winner.ownerUsername;
                   img.onerror = function() {
                       // If image fails to load, replace with initial
                       this.parentNode.innerHTML = winner.ownerUsername.charAt(0).toUpperCase();
                   };
                   img.onload = function() {
                       // Add a subtle zoom effect when image loads successfully
                       this.style.transform = 'scale(1)';
                       this.style.opacity = '1';
                   };
                   // Start with a subtle animation
                   img.style.transform = 'scale(0.9)';
                   img.style.opacity = '0.9';
                   img.style.transition = 'all 0.3s ease';
                   avatarDiv.appendChild(img);
               } else {
                   // If no profile picture, display the first letter of the username
                   const initial = winner.ownerUsername.charAt(0).toUpperCase();
                   avatarDiv.textContent = initial;
               }

               // Create details container
               const detailsDiv = document.createElement('div');
               detailsDiv.className = 'winner-details';

               // Add username with trophy
               const usernameDiv = document.createElement('div');
               usernameDiv.className = 'winner-username';

               // Add username text
               const usernameText = document.createElement('span');
               usernameText.textContent = winner.ownerUsername;
               usernameDiv.appendChild(usernameText);

               // Add trophy icon
               const trophyIcon = document.createElement('span');
               trophyIcon.className = 'winner-trophy';
               trophyIcon.innerHTML = '🏆';
               usernameDiv.appendChild(trophyIcon);

               // Add the winning comment text
               const commentDiv = document.createElement('div');
               commentDiv.className = 'winner-text';
               commentDiv.textContent = winner.text;

               // Add username and comment to details
               detailsDiv.appendChild(usernameDiv);
               detailsDiv.appendChild(commentDiv);

               // No winner label as per user request

               // Add everything to the winner card
               winnerCard.appendChild(avatarDiv);
               winnerCard.appendChild(detailsDiv);

               // Add the winner card to the winners list
               winnersListElement.appendChild(winnerCard);
           });

           // Show the winners container
           winnersContainer.style.display = 'block';

           // Scroll to the winners container with a smooth animation
           winnersContainer.scrollIntoView({ behavior: 'smooth' });
       }

       // Start confetti animation
       function startConfetti() {
           const canvas = confettiCanvas;
           const ctx = canvas.getContext('2d');
           const confettiPieces = [];
           let animationId;

           // Set canvas size to match window
           function resizeCanvas() {
               canvas.width = window.innerWidth;
               canvas.height = window.innerHeight;
           }

           // Initialize canvas size
           resizeCanvas();

           // Update on window resize
           window.addEventListener('resize', resizeCanvas);

           // Confetti class to manage individual pieces
           class Confetti {
               constructor(x, y) {
                   this.x = x;
                   this.y = y;
                   this.size = Math.random() * 10 + 5;
                   this.speed = Math.random() * 3 + 1;
                   this.rotation = Math.random() * 360;
                   this.rotationSpeed = Math.random() * 10 - 5;
                   this.color = this.getRandomColor();
                   this.opacity = 1;
                   this.shapeType = Math.floor(Math.random() * 3); // 0: square, 1: circle, 2: triangle
               }

               getRandomColor() {
                   const colors = [
                       '#f94144', '#f3722c', '#f8961e', '#f9c74f',
                       '#90be6d', '#43aa8b', '#577590', '#277da1',
                       '#ff0000', '#ff7300', '#fffb00', '#48ff00',
                       '#00ffd5', '#002bff', '#7a00ff', '#ff00c8'
                   ];
                   return colors[Math.floor(Math.random() * colors.length)];
               }

               update() {
                   this.y += this.speed;
                   this.rotation += this.rotationSpeed;
                   this.opacity -= 0.005;
                   return this.opacity > 0;
               }

               draw() {
                   ctx.save();
                   ctx.translate(this.x, this.y);
                   ctx.rotate((this.rotation * Math.PI) / 180);
                   ctx.globalAlpha = this.opacity;
                   ctx.fillStyle = this.color;

                   const halfSize = this.size / 2;

                   switch (this.shapeType) {
                       case 0: // Square
                           ctx.fillRect(-halfSize, -halfSize, this.size, this.size);
                           break;
                       case 1: // Circle
                           ctx.beginPath();
                           ctx.arc(0, 0, halfSize, 0, Math.PI * 2);
                           ctx.fill();
                           break;
                       case 2: // Triangle
                           ctx.beginPath();
                           ctx.moveTo(0, -halfSize);
                           ctx.lineTo(halfSize, halfSize);
                           ctx.lineTo(-halfSize, halfSize);
                           ctx.closePath();
                           ctx.fill();
                           break;
                   }

                   ctx.restore();
               }
           }

           // Add confetti pieces
           function addConfetti(count = 10) {
               for (let i = 0; i < count; i++) {
                   const x = Math.random() * canvas.width;
                   const y = Math.random() * -canvas.height / 2;
                   confettiPieces.push(new Confetti(x, y));
               }
           }

           // Initial batch of confetti
           const initialConfettiCount = 150;
           addConfetti(initialConfettiCount);

           // Animation loop to update and draw confetti
           function render() {
               ctx.clearRect(0, 0, canvas.width, canvas.height);

               // Update and draw each piece of confetti
               for (let i = confettiPieces.length - 1; i >= 0; i--) {
                   // Update confetti position and opacity
                   const isVisible = confettiPieces[i].update();

                   // Draw the confetti if it's still visible
                   if (isVisible) {
                       confettiPieces[i].draw();
                   } else {
                       // Remove pieces that are no longer visible
                       confettiPieces.splice(i, 1);
                   }
               }

               // Add more confetti if most have disappeared
               if (confettiPieces.length < initialConfettiCount / 5) {
                   addConfetti(20);
               }

               // Continue animation if there are still pieces
               if (confettiPieces.length > 0) {
                   animationId = requestAnimationFrame(render);
               } else {
                   // Clear any remaining animation once all confetti are gone
                   cancelAnimationFrame(animationId);
                   ctx.clearRect(0, 0, canvas.width, canvas.height);
               }
           }

           // Start the animation
           render();

           // Automatically stop after 10 seconds to prevent endless animation
           setTimeout(() => {
               cancelAnimationFrame(animationId);
               // Fade out remaining confetti
               const fadeInterval = setInterval(() => {
                   if (confettiPieces.length === 0) {
                       clearInterval(fadeInterval);
                       ctx.clearRect(0, 0, canvas.width, canvas.height);
                       return;
                   }

                   for (let i = confettiPieces.length - 1; i >= 0; i--) {
                       confettiPieces[i].opacity -= 0.05;
                       if (confettiPieces[i].opacity <= 0) {
                           confettiPieces.splice(i, 1);
                       }
                   }

                   ctx.clearRect(0, 0, canvas.width, canvas.height);
                   confettiPieces.forEach(piece => piece.draw());
               }, 50);
           }, 10000);
       }

       // Show and hide UI loading indicator
       function showLoading() {
           loadingElement.style.display = 'block';
       }

       function hideLoading() {
           loadingElement.style.display = 'none';
       }

       // Show and hide error messages
       function showError(message) {
           errorMessageElement.textContent = message;
           errorMessageElement.style.display = 'block';
       }

       function hideError() {
           errorMessageElement.style.display = 'none';
       }
   });