import AWS from 'aws-sdk';
import express from 'express';
import multer from 'multer'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config()
const app = express()
const port = process.env.PORT || 4000

//config aws
AWS.config.update({
    region: process.env.REGION,
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey:process.env.SECRET_ACCESS_KEY
})
const tableName = process.env.DYNAMO_TABLE_NAME

const dynamoDb = new AWS.DynamoDB.DocumentClient()
//create s3 client
const s3 = new AWS.S3()

//register middleware
app.use(express.json({extends:false}))
app.use(express.urlencoded({extends:true}))
app.use(express.static('./views'))
app.use("/", express.static("./node_modules/bootstrap/dist/"));

//config view
app.set('view engine', 'ejs')
app.set('views', './views')

//config multer
const storage = multer.memoryStorage({
    destination(req, file, callback){
        callback(null, '')
    }
})

const checkFileType = (file, cb) =>{
    const fileTypes = /jpeg|jpg|png|gif/
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = fileTypes.test(file.mimetype)
    if(extname && mimetype){
        return cb(null, true)
    }
    return cb('Error: Images Only!')
}

const uploadConfig = {
    storage,
    limits: {fileSize: 2000000}, //max: 2mb
    fileFilter(req, file, cb){
        checkFileType(file, cb)
    }
}
const upload = multer(uploadConfig)

//routes
app.get('/', async(req, res)=>{
    try{
        const params = {TableName: tableName}
        const data = await dynamoDb.scan(params).promise()
        res.render('index.ejs', {data: data.Items})
    }catch(error){
        console.log(error)
        return res.status(500).json({error: error.message})
    }
})

app.post('/save', upload.single('image'), async(req, res)=>{
    try {
        const productId = req.body.productId
        const productName = req.body.productName
        const quantity = req.body.quantity

        const image = req.file ? req.file.originalname.split('.') : null
        const fileType = image[image.length - 1]
        const filePath = `${productId}/${Date.now().toString()}.${fileType}`

        const paramsS3 = {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: filePath,
            Body: req.file.buffer,
            ACL: 'public-read',
            ContentType: req.file.mimetype,
        }
        s3.upload(paramsS3, async(err, data)=>{
            if(err) {
                console.log(err)
                return res.status(500).json({error: err.message})
            }else{
                const urlImage =  data.Location
                const dynamoDbParams = {
                    TableName: tableName,
                    Item: {
                        productId,
                        productName,
                        quantity,
                        urlImage
                    }
                }
                await dynamoDb.put(dynamoDbParams).promise()
            }
           
        })

    } catch (err) {
        res.status(500).json({error: err.message})
    }
})

app.post('/delete', upload.fields([]) ,async(req, res)=>{
    const listCheckbox = Object.keys(req.body)
    if(listCheckbox.length <= 0 || !listCheckbox){
        return res.redirect('/')
    }else{
        try {
            const onDelete = (length) =>{
                const param ={
                    TableName: tableName,
                    Key: {
                        productId: listCheckbox[length]
                    }
                }
                dynamoDb.delete(param, (err, data)=>{
                    if(err) return res.status(500).json({error: err.message})
                    if(length === 0) return res.redirect('/')
                    onDelete(length - 1)
                })
                onDelete(listCheckbox.length-1)
            }
        } catch (error) {
            return res.status(500).send('Internal Server Error')
        }
    }

})

app.listen(port, function () {
    console.log(`http://localhost:${port}`)
    // console.log(${`Example app listening on port !`});
  });