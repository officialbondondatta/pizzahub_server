import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());



const PORT = process.env.PORT || 8001;

//mongodb_connection

const client = new MongoClient(process.env.MONGODB_URI);

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
    console.log(user)
    next()
}

const verifyVendor = async (req, res, next) => {
    const user = req.user
    if (user.role !== "vendor") {
        res.status(401).send({ message: "Unauthorized" })
        return
    }
    console.log("verified vendor")
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

//user routes
app.get("/users", verifyToken, async (req, res) => {
    try {
        const allUsers = await users.find({}).toArray();
        res.json(allUsers);
    } catch (err) {
        console.dir(err);
        res.status(500).send("Error fetching users");
    }
});

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



//menu routes

app.post('/menu-items', verifyToken, verifyVendor, async (req, res) => {
    const data = req.body
    const result = await menuitems.insertOne(data)
    res.send(result)
})




//home route
app.get("/", (req, res) => {
    res.send("Welcome to PizzaHub API");
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});