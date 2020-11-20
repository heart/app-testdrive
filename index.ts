require('dotenv').config()
const express = require('express')
const app = express()
const port = 3000
const multer = require('multer');
const bodyParser= require('body-parser')
var fs = require('fs')
var path = require('path')
var dateFormat = require('dateformat');
  
const myBodyParser =  bodyParser.urlencoded()

app.use(bodyParser.urlencoded({extended: true}))

let getEnv = (name) => {
  return process.env[name]
}

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync('upload')){
        fs.mkdirSync('upload');
    }
    cb(null, 'upload')
  },
  filename: function (req, file, cb) {
    var dateString = new Date().getTime() //dateFormat(new Date(), "yyyymmmdS_hh_MM_ss");
    cb(null, `${dateString}${path.extname(file.originalname)}`)
  }
})
var upload = multer({ storage: storage })

app.use('/public', express.static( path.join(__dirname, 'public')))
app.use('/downloads', express.static(path.join(__dirname, 'downloads')))

app.set("view engine", "ejs")

app.get('/', function (req, res) {
  res.render('index')
})

app.get('/favicon.ico', function (req, res) {
  res.sendFile(path.join(__dirname, `public/favicon.ico`))
})

app.get("/site.webmanifest",function (req, res) {
  res.sendFile(path.join(__dirname, `public/site.webmanifest`))
})

app.get("/robots.txt",function (req, res) {
  res.sendFile(path.join(__dirname, `public/robots.txt`))
})

app.delete('/temp', function(req, res){
  if(getEnv("UPLOAD_SECRET") != req.header('Authorization')){
    res.status(500).send('Access Denied.')
    fs.unlinkSync(req.file.path)
  }else{
    const directoryPath = path.join(__dirname, `upload`)
    fs.readdir(directoryPath, function (err, files) {
        if (err) {
            return console.log('Unable to scan directory: ' + err)
        } 
        for(let i in files){
          fs.unlinkSync(`${directoryPath}/${files[i]}`)
        }
        res.send({success:true})
    })
  }
})

app.delete('/upload/:customer/:environment/:file', function(req, res){
  if(getEnv("UPLOAD_SECRET") != req.header('Authorization')){
    res.status(500).send('Access Denied.')
    fs.unlinkSync(req.file.path)
  }else{
    let environment = req.params.environment
    let customer = req.params.customer
    let filePrefix = req.params.file
    const directoryPath = path.join(__dirname, `downloads/${customer}/${environment}`);
    fs.readdir(directoryPath, function (err, files) {
        if (err) {
            return console.log('Unable to scan directory: ' + err);
        } 
        
        for(let i in files){
          if(files[i].startsWith(filePrefix)){
            fs.unlinkSync(`${directoryPath}/${files[i]}`)
          }
        }
 
        res.send({success:true})
    })
  }
})

app.post('/upload/:environment', upload.single('file'), function (req, res, next) {
  const file = req.file
  if (!file) {
    res.status(500).send('No File upload.')
  }

  if(getEnv("UPLOAD_SECRET") != req.header('Authorization')){
    res.status(500).send('Access Denied.')
    fs.unlinkSync(req.file.path)
  }else{
    let environment = req.params.environment
    let uploadPath = `downloads/${req.body.customer}/${environment}`
    
    if (!fs.existsSync('downloads')){
      fs.mkdirSync('downloads');
    }
    if (!fs.existsSync(`downloads/${req.body.customer}`)){
      fs.mkdirSync(`downloads/${req.body.customer}`);
    }
    if (!fs.existsSync(uploadPath)){
      fs.mkdirSync(uploadPath);
    }

    let destFilename = `${uploadPath}/${req.file.filename}`
    
    fs.copyFile(req.file.path, destFilename, (err) => {
        if (err){
          console.log(err)
        }
        fs.unlinkSync(req.file.path)
    });

    if(req.body.platform == "ios"){
      let plistFilkeName = req.file.filename.split(".")[0]+".plist"
      let plistFile = createPlistFile(destFilename, req.body.app_id, req.body.version, req.body.app_name)
      fs.writeFile(`${uploadPath}/${plistFilkeName}`, plistFile, function (err) {
        if (err) return console.log(err);
      });
    }
    
    res.send({success:true})
  }
})

app.get('/android/:customer/:environment',function (req, res){
  let environment = req.params.environment
  let customer = req.params.customer

  const directoryPath = path.join(__dirname, `/downloads/${customer}/${environment}`)
  
    fs.readdir(directoryPath, function (err, files) {
        if (err) {
          res.status(404).send('Page Not Found.')
          return console.log('Unable to scan directory: ' + err);
        } 
            
        let binaryFile = []
        for(let i in files){
          if(files[i].endsWith('.apk')){
            let data = {
              link: getEnv("SERVER_URL")+ `/downloads/${customer}/${environment}/` +files[i],
              name: files[i].split(".")[0]
            }
            binaryFile.push(data)
          }
        }
        // console.log(binaryFile);
        // console.log('///////////////');
        binaryFile.sort().reverse();
        //console.log('///////////////');
        //console.log(binaryFile);
       // binaryFile .reverse();
      //  console.log('///////////////');
 
        res.render('download', {
          platform:"android",
          iosLink:`/ios/${req.params.customer}/${req.params.environment}`,
          androidLink:`/android/${req.params.customer}/${req.params.environment}`,
          customer:req.params.customer,
          environment: req.params.environment,
          files: binaryFile,
          dateFormat:dateFormat
        })
    })
})

app.get('/ios/:customer/:environment',function (req, res){
  let environment = req.params.environment
  let customer = req.params.customer

  const directoryPath = path.join(__dirname, `/downloads/${customer}/${environment}`)
  
    fs.readdir(directoryPath, function (err, files) {
        if (err) {
          res.status(404).send('Page Not Found.')
          return console.log('Unable to scan directory: ' + err);
        } 
        
        files.sort().reverse()

        let binaryFile = []
        for(let i in files){
          if(files[i].endsWith('.plist')){
            let data = {
              link: "itms-services://?action=download-manifest&url="+ getEnv("SERVER_URL")+ `/downloads/${customer}/${environment}/` +files[i],
              name: files[i].split(".")[0]
            }
            binaryFile.push(data)
          }
        }
        
        res.render('download', {
          platform:"ios",
          iosLink:`/ios/${req.params.customer}/${req.params.environment}`,
          androidLink:`/android/${req.params.customer}/${req.params.environment}`,
          customer:req.params.customer,
          environment: req.params.environment,
          files: binaryFile
        })
    })

})

function createPlistFile(fileName, appId, appVersion, appName){
    let baseUrl = getEnv("SERVER_URL")
    return `<?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
    <plist version="1.0">
    <dict>
      <key>items</key>
      <array>
        <dict>
          <key>assets</key>
          <array>
            <dict>
              <key>kind</key>
              <string>software-package</string>
              <key>url</key>
              <string>${baseUrl}/${fileName}</string>
            </dict>
            <dict>
              <key>kind</key>
              <string>display-image</string>
              <key>url</key>
              <string>${baseUrl}/public/icon1.png</string>
            </dict>
            <dict>
              <key>kind</key>
              <string>full-size-image</string>
              <key>url</key>
              <string>${baseUrl}/public/icon2.png</string>
            </dict>
          </array>
          <key>metadata</key>
          <dict>
            <key>bundle-identifier</key>
            <string>${appId}</string>
            <key>bundle-version</key>
            <string>${appVersion}</string>
            <key>kind</key>
            <string>software</string>
            <key>platform-identifier</key>
            <string>com.apple.platform.iphoneos</string>
            <key>title</key>
            <string>${appName}</string>
          </dict>
        </dict>
      </array>
    </dict>
    </plist>
    `
}

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})

 