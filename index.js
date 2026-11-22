import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import Stripe from 'stripe'
dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());



const PORT = process.env.PORT || 8001;

//mongodb_connection

const client = new MongoClient(process.env.MONGODB_URI);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const connectToMongoDB = async () => {
    try {
        await client.connect();
        console.log("You successfully connected to MongoDB!");
        return client;
    } catch (err) {
        console.dir(err);
    }
}

//mondodb database

const mongoClient = await connectToMongoDB();
const db = mongoClient.db("pizzahub");
const users = db.collection("user");
const sessions = db.collection("session")
const menuitems = db.collection("menuitems")
const transactions = db.collection("transactions")
const orders = db.collection("orders")

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization
    if (!authHeader) {
        res.status(401).send({ message: "Unauthorized" })
        return
    }

    const token = authHeader.split(' ')[1]
    if (!token) {
        res.status(401).send({ message: "Unauthorized" })
        return
    }

    const query = { token }
    const session = await sessions.findOne(query)
    if (!session) {
        res.status(401).send({ message: "Unauthorized" })
        return
    }
    const userId = session.userId

    const userQuery = { '_id': new ObjectId(userId) }
    const user = await users.findOne(userQuery)
    if (!user) {
        res.status(401).send({ message: "Unauthorized" })
        return
    }
    req.user = user
    next()
}

const verifyVendor = async (req, res, next) => {
    const user = req.user
    if (user.role !== "vendor") {
        res.status(401).send({ message: "Unauthorized" })
        return
    }
    next()
}
const verifyVendorandAdmin = async (req, res, next) => {
    const user = req.user
    if (user.role !== "vendor" && user.role !== "admin") {
        res.status(401).send({ message: "Unauthorized" })
        return
    }
    next()
}
const verifyAdmin = async (req, res, next) => {
    const user = req.user
    if (user.role !== "admin") {
        res.status(401).send({ message: "Unauthorized" })
        return
    }
    next()
}
const verifyCustomer = async (req, res, next) => {
    const user = req.user
    if (user.role !== "customer") {
        res.status(401).send({ message: "Unauthorized" })
        return
    }
    next()
}

//customer routes

app.post('/order', verifyToken, verifyCustomer, async (req, res) => {
    const data = req.body
    const itemId = data.menuItemId
    const user = req.user._id.toString()
    const query = { "customerId": user, "menuItemId": itemId, "status": "pending" }
    const order = await orders.findOne(query)
    if (order) {
        return res.send({ message: "Order already exists" })
    }
    const result = await orders.insertOne(data)
    res.send(result)
})

//only-customer [ user specific orders]
app.get('/order/:id', verifyToken, verifyCustomer, async (req, res) => {
    const id = req.params.id
    const user = req.user
    const checkId = new ObjectId(id)
    if (!user._id.equals(checkId)) {
        return res.send({ message: "You can not access these orders" })
    }
    const query = { 'customerId': id }
    const result = await orders.find(query).toArray()
    res.send(
        result.map(order => ({
            ...order,
            createdAt: order.createdAt || order._id.getTimestamp().toISOString(),
        }))
    )
})
app.patch('/order/:id', verifyToken, verifyVendor, async (req, res) => {
    const id = req.params.id
    const data = req.body
    const user = req.user


    const userId = user?._id
    const orderQuery = { '_id': new ObjectId(id) }

    const updatableOrder = await orders.findOne(orderQuery)

    if (!updatableOrder) {
        res.send({ message: "Order does not exists" })
        return
    }

    if (userId.toString() !== updatableOrder.vendorId.toString()) {
        return res.send({ message: "You can not access these orders" })
    }
    const query = { '_id': new ObjectId(id) }
    const updatedDoc = {
        $set: {
            status: data.status
        }
    }
    const result = await orders.updateOne(query, updatedDoc)
    res.send(result)

})

app.patch('/order/cancel/:id', verifyToken, verifyCustomer, async (req, res) => {
    const id = req.params.id
    const orderQuery = { _id: new ObjectId(id) }

    const user = req.user
    const orderToBeCancelled = await orders.findOne(orderQuery)

    if (orderToBeCancelled.customerId !== user._id.toString()) {
        return res.send({ message: "You are not authorized to cancel this order" })
    }
    const updatedDoc = {
        $set: {
            status: "cancelled"
        }
    }
    const result = await orders.updateOne(orderQuery, updatedDoc)
    res.send(result)
})

//only-vendor [ all orders]

app.get('/order', verifyToken, verifyVendor, async (req, res) => {
    const user = req.user
    const query = { 'vendorId': user._id.toString() }
    const result = await orders.find(query).toArray()
    console.log(result)
    res.send(
        result.map(order => ({
            ...order,
            createdAt: order.createdAt || order._id.getTimestamp().toISOString(),
        }))
    )
})

//transactions route

app.get('/transactions', verifyToken, verifyAdmin, async (req, res) => {
    const response = await transactions.find({}).toArray()
    res.send(response)
})


//payment
app.post('/payment/checkout-verify', verifyToken, verifyVendor, async (req, res) => {
    const { sessionId } = req.body
    if (!sessionId) {
        return res.send({ success: false, message: "SessionId required for payment" })
    }
    const {
        payment_status,
        status,
        metadata,
        amount_total,
        currency,
    } = await stripe.checkout.sessions.retrieve(sessionId)

    if (status === "complete" && payment_status === "paid") {

        const sessionQuery = { stripeSessionId: sessionId }
        const isExist = await transactions.findOne(sessionQuery)
        if (isExist) {
            return res.send({ success: false, message: "Payment already verified" })
        }
        const payment = {
            vendorId: metadata.userId,
            stripeSessionId: sessionId,
            stripeSubscriptionId: "acb",
            plan: "premium",
            amount: amount_total,
            currency: currency,
            status: status,
            payment_date: new Date()
        }
        const result = await transactions.insertOne(payment)

        const updatedDoc = {
            $set: {
                plan: "premium"
            }
        }
        const query = { '_id': new ObjectId(metadata.userId) }
        const updationResult = await users.updateOne(query, updatedDoc)
        res.send({ success: true, result, updationResult })
        return
    }
    res.send({ success: false, message: "Payment verification false" })
})




//user routes
app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const allUsers = await users.find({}).toArray();
        res.json(allUsers);
    } catch (err) {
        console.dir(err);
        res.status(500).send("Error fetching users");
    }
});

app.get('/users/info', verifyToken, verifyVendor, async (req, res) => {
    const query = { 'role': "customer" }
    const result = await users.find(query, { projection: { name: 1, image: 1, email: 1 } }).toArray()
    res.send(result)
})

app.patch("/users/:id", verifyToken, async (req, res) => {
    const { id } = req.params;
    const data = req.body;
    try {
        const result = await users.updateOne(
            { _id: new ObjectId(id) },
            { $set: { name: data.name, image: data.image } },
        );
        if (result.matchedCount === 0) {
            res.status(404).send("User not found");
        } else {
            res.send("User updated successfully");
        }
    } catch (err) {
        console.dir(err);
        res.status(500).send("Error updating user");
    }
});

app.patch("/users/block/:id", verifyToken, verifyAdmin, async (req, res) => {
    const id = req.params.id
    const query = { '_id': new ObjectId(id) }
    const user = await users.findOne(query)
    if (!user) {
        return res.status(404).send({ message: "User not found" })
    }
    if (user.role === "admin") {
        console.log("yeaa")
        return res.send({ message: "Admin can not block admins" })
    }
    const updatedDoc = {
        $set: {
            isBlocked: !user.isBlocked
        }
    }
    const result = await users.updateOne(query, updatedDoc)
    res.json(result)
})


//menu routes

app.get('/menu-items/active-items/:id', verifyToken, verifyVendor, async (req, res) => {
    const id = req.params.id
    const itemsQuery = {
        'vendorId': id,
        isActive: true
    }
    const result = await menuitems.countDocuments(itemsQuery)
    res.send(result)
})

app.post('/menu-items', verifyToken, verifyVendor, async (req, res) => {
    const data = req.body
    const result = await menuitems.insertOne(data)
    res.send(result)
})

app.get('/menu-items', async (req, res) => {
    const result = await menuitems.find({}).toArray()
    res.send(result)
})

app.delete('/menu-items/:id', verifyToken, verifyVendorandAdmin, async (req, res) => {
    const id = req.params.id
    const query = { '_id': new ObjectId(id) }
    const result = await menuitems.deleteOne(query)
    res.send(result)
})

app.patch('/menu-items/availability/:id', verifyToken, verifyVendorandAdmin, async (req, res) => {
    const data = req.body
    const id = req.params.id
    if (typeof data?.isActive !== 'boolean') {
        return res.status(400).send({
            message: 'isActive must be a boolean'
        });
    }
    const query = { '_id': new ObjectId(id) }
    const status = await menuitems.findOne(query, { projection: { status: 1 } })
    const itemCurrentStatus = status.status
    if ((itemCurrentStatus === "pending" || itemCurrentStatus === "rejected") && data.isActive === true) {
        res.send({ message: `Status is ${itemCurrentStatus}` })
        return
    }
    const updatedAvailability = {
        $set: {
            isActive: data.isActive
        }
    }
    const result = await menuitems.updateOne(query, updatedAvailability)
    res.send(result)
})

app.patch('/menu-items/:id', verifyToken, verifyVendor, async (req, res) => {
    const data = req.body
    const id = req.params.id
    const query = { '_id': new ObjectId(id) }
    const options = { upsert: true }
    const updatedData = {
        $set: {
            name: data.name,
            category: data.category,
            price: data.price,
            description: data.description,
            location: data.location,
            image: data.image
        }
    }
    const result = await menuitems.updateOne(query, updatedData, options)
    res.send(result)

})


app.patch('/menu-items/status/:id', verifyToken, verifyAdmin, async (req, res) => {
    const id = req.params.id
    const data = req.body
    const query = { '_id': new ObjectId(id) }
    const isActive = await menuitems.findOne(query, { projection: { isActive: 1 } })
    const value = data.status === "pending" || data.status === "rejected" ? false : isActive.isActive
    const updatedDoc = {
        $set: {
            status: data.status,
            isActive: value
        }
    }
    const result = await menuitems.updateOne(query, updatedDoc)
    res.send(result)
})

app.get('/menu-items/:id', verifyToken, verifyVendor, async (req, res) => {
    const vendorId = req.params.id
    const result = await menuitems.find({ vendorId }).toArray()
    res.send(result)
})

app.get('/menu-items/details/:id', verifyToken, async (req, res) => {
    const itemId = req.params.id
    const query = { '_id': new ObjectId(itemId) }
    const result = await menuitems.findOne(query)
    res.send(result)
})

//home route
app.get("/", (req, res) => {
    res.send("Welcome to PizzaHub API");
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
