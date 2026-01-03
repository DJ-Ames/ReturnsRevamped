# ReturnsRevamped

DISCLAIMERS
Only works on the webapp version of Menards.com

Not developed by Menards.

Only tested using Firefox + Tampermonkey

Will trigger Captcha's from Menards.com

Browser may sometimes crash. Data persists after crash.

Only works on Menards.com

Could potentially cease to work after an update from Menards.com

If things run too slow you may have to delete your notes. Notes feature has not been fully tested

There won't be any updates to the script after I either leave the store or if Menards implements a feature similar to this.

PURPOSE
This webscript allows the user to scan the entire contents of a return cart and displays all the aisles the user will visit to finish the cart. 

With this webscript the user may avoid backtracking and they are better equipped to handle disorganized or extremely full returns carts.

FEATURES
Creates an overlay over the menards webpage for storing a temporary list. 

Whenever a product page is loaded the program stores the Product's name, SKU, price and aisle location.

List can be deleted either one by one or all at once.

Speeds up the process of opening up the barcode scanner on the website. 

Allows the user to store notes about individual products.

Allows user to clear any notes.

User can press one of the aisle buttons in the aisle column to sort the contents of that aisle to the top. 

Orders sorted aisle alphabetically by section letter. 

INSTRUCTIONS
Use a browser that can install one of the below extensions:
Tampermonkey (The only one currently tested),
Violentmonkey,
Userscripts (safari)

Create a New Script on the script extension

copy+paste the contents of webrevamp.js

alternatively save the .js file and import the file directly into the extension

On Tampermonkey you can import the .js file on the Utilities tab. 

Go to Menards.com with the extension and the script active.