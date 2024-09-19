const express = require('express');
const logger = require('morgan');
const expressSession = require('express-session');
const passport = require("passport");
const LocalStrategy = require('passport-local').Strategy; // Import LocalStrategy
const QRCode = require('qrcode');
const fs = require('fs');
const QRCodeReader = require('qrcode-reader');
const multer = require('multer');
const sharp = require('sharp');
const { PNG } = require('pngjs'); 
const cookieParser = require("cookie-parser");
const path = require("path");
const bcrypt = require("bcrypt");
const jsQR = require("jsqr");


const userModel = require("./models/userModel");  
const productModel = require("./models/productModel");

const app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({extended: true}));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('uploads'));

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');


app.use(expressSession({
    resave: false,
    saveUninitialized: false,
    secret: "heyheyehhdd",
    cookie: { maxAge: 60000 }
}));


app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(userModel.authenticate()));
passport.serializeUser(userModel.serializeUser());
passport.deserializeUser(userModel.deserializeUser());


const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');  
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });


app.get('/', function(req, res){
    res.render("register")
})

app.post('/register', async function(req, res) {
    const { username, password, email, name } = req.body;
    console.log(password)

    userModel.register(new userModel({ username, email, name }), password, (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error registering user');
        }
        passport.authenticate('local')(req, res, () => {
            res.redirect('/dashboard');  
        });
    });
});


app.get('/login', (req, res) => {
    res.render('login');  
}); 

app.post('/login', passport.authenticate('local', {
    successRedirect: '/dashboard',
    failureRedirect: '/login',
}));

 

// app.post('/login', (req, res, next) => {
//     passport.authenticate('local', (err, user, info) => {
//         if (err) {
//             console.error('Authentication error:', err);
//             return next(err);
//         }
//         if (!user) {
//             console.log('Authentication failed:', info.message);
//             return res.redirect('/login');
//         }
//         req.logIn(user, (err) => {
//             if (err) {
//                 console.error('Login error:', err);
//                 return next(err);
//             }
//             return res.redirect('/dashboard');
//         });
//     })(req, res, next);
// });




function isLoggedIn(req, res, next) {
    console.log('User authenticated:', req.isAuthenticated());
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

app.get('/dashboard', isLoggedIn, async (req, res) => {
    try {
        const products = await productModel.find(); // Fetch all products
        res.render('dashboard', { products });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server Error");
    }
});




app.get('/logout', (req, res) => {
    // Destroy the session
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/');  
        }
        res.clearCookie('connect.sid'); 
        res.redirect('login');  
    });
});


app.get("/addproduct", function(req,res){
    res.render("addproduct")
})


app.post('/product', async (req, res) => {
    try {
        const { productName, date, quantity, status } = req.body;

        let dateArrival = Date.now();
        if (date && !isNaN(Date.parse(date))) {
            dateArrival = new Date(date);
        }

        const productStatus = status || 'Pending';

        const product = await productModel.create({
            productName,
            quantity,
            dateArrival,
            status: productStatus
        });

        // Generate QR code for the product
        const qrCodeData = JSON.stringify({
            productName: product.productName,
            quantity: product.quantity,
            dateArrival: product.dateArrival,
            status: product.status,
        });

        const qrCode = await QRCode.toDataURL(qrCodeData);

        // Update the product with the QR code URL
        product.qrCode = qrCode;
        await product.save();

        res.redirect('/dashboard');
    } catch (err) {
        console.error("Error creating product: ", err);
        res.status(500).send("Internal Server Error");
    }
});

app.get('/product/edit/:id', async (req, res) => {
    try {
        const product = await productModel.findById(req.params.id);
        res.render('edit', { product });
    } catch (err) {
        console.error("Error fetching product: ", err);
        res.status(500).send("Internal Server Error");
    }
});

app.post('/product/edit/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        const { productName, dateArrival, quantity, status } = req.body;

        
        const product = await productModel.findById(productId);
        if (!product) {
            return res.status(404).send("Product not found");
        }

        
        product.productName = productName;
        product.quantity = quantity;
        product.status = status;

        
        if (dateArrival && !isNaN(Date.parse(dateArrival))) {
            product.dateArrival = new Date(dateArrival);
        } else {
            product.dateArrival = new Date(); 
        }

        await product.save();

        const qrCodeData = JSON.stringify({
            productName: product.productName,
            quantity: product.quantity,
            dateArrival: product.dateArrival,
            status: product.status,
        });

        const qrCode = await QRCode.toDataURL(qrCodeData);

        // Update product with new QR code
        product.qrCode = qrCode;
        await product.save();

        res.redirect('/dashboard');
    } catch (err) {
        console.error("Error updating product: ", err);
        res.status(500).send("Internal Server Error");
    }
});



app.get('/product/delete/:id', async (req, res) => {
    try {
        const productId = req.params.id;

        await productModel.findByIdAndDelete(productId);

        res.redirect('/dashboard');
    } catch (err) {
        console.error("Error deleting product: ", err);
        res.status(500).send("Internal Server Error");
    }
});


app.post('/upload-qr', upload.single('qrCodeImage'), async (req, res) => {
    if (req.file) {
        const qrCodePath = path.join(__dirname, 'uploads', req.file.filename);
        console.log(qrCodePath);
        
        try {
            const data = await fs.promises.readFile(qrCodePath);
            console.log(data);
            
            const image = PNG.sync.read(data);
            const qrCodeData = jsQR(image.data, image.width, image.height);
            console.log(qrCodeData);
            
            if (!qrCodeData) {
                console.error('QR code decoding failed. No result.');
                return res.status(500).send('QR code decoding failed.');
            }

            console.log('QR code decoded:', qrCodeData.data);
            try {
                const productData = JSON.parse(qrCodeData.data);
                console.log('Product data:', productData);
                 
                req.session.productData = productData;
                console.log('Product data stored in session:', req.session.productData);

                res.redirect('/dispatchDashboard');
            } catch (parseError) {
                console.error('JSON parse error:', parseError);
                res.status(500).send('QR code data is not valid JSON.');
            }
        } catch (readError) {
            console.error('Image read error:', readError);
            res.status(500).send('Image read error.');
        }
    } else {
        res.status(400).send('No file uploaded.');
    }
});






app.get('/upload-qr', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Upload QR Code</title>
            
        </head>
        <style>
        /* General styling */
body {
    font-family: Arial, sans-serif;
    background-color: #f2f2f2;
    margin: 0;
    padding: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    height: 100vh;
}

/* Centered container */
form {
    background-color: #fff;
    padding: 20px;
    border-radius: 10px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    text-align: center;
}

/* Page title */
h1 {
    color: #333;
    margin-bottom: 20px;
}

/* File input styling */
input[type="file"] {
    margin-bottom: 15px;
}

/* Button styling */
button {
    background-color: #4CAF50;
    color: white;
    padding: 10px 20px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 16px;
}

button:hover {
    background-color: #45a049;
}

        </style>
        <body>
            <h1>Upload QR Code</h1>
            <form action="/upload-qr" method="POST" enctype="multipart/form-data">
                <input type="file" name="qrCodeImage" accept="image/*" required>
                <button type="submit">Upload QR Code</button>
            </form>

        </body>
        </html>
    `);
});

app.get('/generate-qr', (req, res) => {
    QRCode.toDataURL('Sample QR code text', (err, url) => {
        if (err) {
            console.error('Error generating QR code:', err);
            res.status(500).send('Error generating QR code');
        } else {
            res.send(`<img src="${url}" alt="QR Code"/>`);
        }
    });
});

app.post('/dispatch', async (req, res) => {
    const { quantityDispatched } = req.body;
    console.log(quantityDispatched);
    
    const product = req.session.productData;
    
 
    
    //  const product = await productModel.findOne({})
    if (!product) {
        return res.status(400).send('No product data found.');
    }

    try {
        const dispatchQuantity = parseInt(quantityDispatched);

        if (dispatchQuantity > product.quantity) {
            return res.status(400).send('Dispatch quantity exceeds available stock.');
        }

        product.quantity -= dispatchQuantity;
        console.log(product.quantity);
        

        const updatedProduct = await productModel.findOneAndUpdate(
            {productName:product.productName},
            {quantity:product.quantity},
            {
                new: true,

            }
        );

        console.log('Updated product:', updatedProduct); 

        
        req.session.productData = null;
        res.send(`<script>alert('Dispatch successful!'); window.location.href = '/dashboard';</script>`);
    } catch (error) {
        console.error('Dispatch error:', error);
        res.status(500).send('Error dispatching product.');
    }
});







app.get('/dispatchDashboard',async  (req, res) => {
    const productData = req.session.productData;
      console.log(productData);
 
      
    console.log('Product data in session on /dispatchDashboard:', productData);

    if (!productData) {
        return res.status(400).send('No product data found. Please upload a QR code first.');
    }

    res.render('dispatchdashboard', { product: productData });
});



app.listen(3000);