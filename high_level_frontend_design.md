In this stage, our goals are the followings:
- Users can create, delete, and rename collections
- Users can create, delete, and rename decks within a collection, as well as modify deck tags.
- Users can create, delete, edit words within a deck

# The UI pages

## Setting

We will put all settings in this page. Consider using a tag button or a hamburger button to navigate to this page.

## Collections

This is the default page users see upon visiting the website.
- Display all collections
- A button allowing users to create a new collection.
- During the collection creation process, users can input a collection name.
- Collection names must be unique; however, the name should not be used as the ID for storage. (Note: Backend logic needs verification).
- In addition to `name: string`, add a `desc: string` field so users can provide a description for each collection.
- On this page, users can edit, delete, or reorder collections, as well as editing description of a collection.
- Once a collection is named and created, the app navigates directly to the Decks page.
- Identify an intuitive way for both mobile and desktop users to perform complex actions (editing, deleting, and reordering).

## Decks

When a user selects a collection, navigate them to the Decks Page.
- Users must be able to navigate back to the Collections Page.
- Show all decks associated with the selected collection.
- Follow a design consistent with the Collection Page, allowing users to add, edit, delete, and reorder decks.
- Include a progress bar indicating the overall learning progress for each deck.
- Include a indicator (like a icon) show the fimilar level of the deck.
- Include a indicator show the number of words a Deck has for each deck.
- Include additional UI slots (e.g., buttons) to support future functional expansions, such as an Auto-Generate Decks feature.

## Words

When a user selects a deck, navigate them to the Words Page.
- Users should be able to navigate back to the Decks Page or directly to the Collections Page.
- List all words within the selected deck.
- Maintain a consistent design with other pages, allowing users to delete and reorder words.
- Include a label displaying the total word count for the deck.
- For each word, display the text, current learning progress, and relevant FSRS metrics to help users understand their level of familiarity.
- For this stage, require users to manually input all fields when adding a new word. (Dictionary backend integration will follow in a later phase).
- Similarly, users must manually edit all fields at this stage to verify the UI flow and data integrity.
- A test button brings the user to the deck test mode with current deck.

## Word

When a user selects a word, navigate them to the Word Page.
- Users should be able to navigate back to the Words Page.
- They can see all the details of the word.
- A Edit button helping them to edit the word data directly.

## Deck Test Mode

Let's make this a placeholder for this stage.