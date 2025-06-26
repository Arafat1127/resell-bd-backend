const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const Stripe = require('stripe');
require('dotenv').config();

const app = express();
const port = 7000;

// Middleware
app.use(cors());
app.use(express.json());

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.z1t2q.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function serverStart() {
    try {
        await client.connect();
        const database = client.db('Resell-Bd');
        const userCollection = database.collection('Users');
        const productsCollection = database.collection('Products');
        const ordersCollection = database.collection('Orders');

        // ✅ Add new product with seller verified info
        app.post('/products', async (req, res) => {
            const product = req.body;
            const seller = await userCollection.findOne({ email: product.sellerEmail });
            product.verified = seller?.verified || false;
            const result = await productsCollection.insertOne(product);
            res.send(result);
        });

        // ✅ Get products (optionally by category)
        app.get('/products', async (req, res) => {
            const category = req.query.category;
            const query = category ? { category } : {};
            const products = await productsCollection.find(query).toArray();
            res.send(products);
        });

        // ✅ Add new order
        app.post('/orders', async (req, res) => {
            const orders = req.body;
            const exists = await ordersCollection.findOne({
                buyerEmail: orders.buyerEmail,
                productName: orders.productName
            });

            if (exists) {
                return res.send({ acknowledged: false, message: 'Already ordered this product!' });
            }
            const newOrder = {
                ...orders,
                status: 'Pending',
                createdAt: new Date()
            };

            const result = await ordersCollection.insertOne(newOrder);
            res.send(result);
        });

        // ✅ Get orders by user email
        app.get('/orders', async (req, res) => {
            const email = req.query.email;
            if (!email) return res.status(400).send({ error: 'Email is required' });

            const query = { buyerEmail: email };
            const result = await ordersCollection.find(query).toArray();
            res.send(result);
        });

        // ✅ Get order by ID
        app.get('/orders/:id', async (req, res) => {
            const id = req.params.id;
            const result = await ordersCollection.findOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        // ✅ Get all orders (admin)
        app.get('/admin/orders', async (req, res) => {
            const result = await ordersCollection.find().toArray();
            res.send(result);
        });

        // ✅ Delete an order
        app.delete('/orders/:id', async (req, res) => {
            const id = req.params.id;
            const result = await ordersCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        // ✅ Add new user
        app.post('/users', async (req, res) => {
            const user = req.body;
            const existingUser = await userCollection.findOne({ email: user.email });
            if (existingUser) {
                return res.send({ acknowledged: false, message: "User already exists" });
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        // ✅ Get all or single user
        app.get('/users', async (req, res) => {
            const email = req.query.email;
            const query = email ? { email } : {};
            const users = await userCollection.find(query).toArray();
            res.send(users);
        });

        // ✅ Make user admin
        app.put('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const result = await userCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { role: 'admin' } }
            );
            res.send(result);
        });

        // ✅ Verify user and update their products
        app.put('/users/verify/:id', async (req, res) => {
            const id = req.params.id;
            const user = await userCollection.findOne({ _id: new ObjectId(id) });

            const userUpdate = await userCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { verified: true } }
            );

            const productUpdate = await productsCollection.updateMany(
                { sellerEmail: user.email },
                { $set: { verified: true } }
            );

            res.send({
                userUpdated: userUpdate.modifiedCount,
                productsUpdated: productUpdate.modifiedCount
            });
        });

        // ✅ Delete user
        app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;
            const result = await userCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        // ✅ Create Stripe payment intent (BDT)
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100); // Convert to paisa

            const paymentIntent = await stripe.paymentIntents.create({
                amount,
                currency: 'bdt',
                payment_method_types: ['card']
            });

            res.send({ clientSecret: paymentIntent.client_secret });
        });

        // ✅ Mark order as paid
        app.put('/orders/paid/:id', async (req, res) => {
            const id = req.params.id;
            const { transactionId } = req.body;

            const result = await ordersCollection.updateOne(
                { _id: new ObjectId(id) },
                {
                    $set: {
                        status: 'Paid',
                        transactionId
                    }
                }
            );
            res.send(result);
        });

    } finally {
        // await client.close();
    }
}

serverStart().catch(console.dir);

app.get('/', (req, res) => {
    res.send('✅ Resell BD API is running');
});

app.listen(port, () => {
    console.log(`✅ Server running at http://localhost:${port}`);
});
