const express = require("express");
const http = require('http')
const https = require('https')
const { Server } = require("socket.io");
const fs = require('fs')

const app = express();
const privateKey = fs.readFileSync('private.key', 'utf8');
const certificate = fs.readFileSync('certificate.crt', 'utf8');

const credentials = { key: privateKey, cert: certificate };
const httpServer = http.createServer()
const httpsServer = https.createServer(credentials, app);

const io = new Server(httpsServer,{
	cors:'localhost:8080'
})
io.attach(httpServer);


let userRoom = new Map() //键为用户id，值为用户的房间号和用户名
let roomMap = new Map() //键为房间号，值为该房间的用户
let offerMap = new Map() //键为房间号，值为发送发的offer
let fileUploadMap = new Map() //键为文件诞生的时间戳，值为文件
let imageUploadMap = new Map() //键问图片发送的时间戳，值为图片

io.on("connection", (socket) => {
	// console.log('连接成功')
	let list = []
	let key = roomMap.keys()
	for(let k of key){
		list.push(k)
	}
	socket.emit('getRoomList',list)
	socket.on('joinRoom',(data)=>{
        const {userName,roomName} = data
		//如果是新的房间,则向所有用户广播添加了新的房间。
        if(!roomMap.has(roomName)){
          io.emit('addNewRoom',roomName)
		  roomMap.set(roomName,[userName])
		  socket.join(roomName)
		  userRoom.set(socket.id,{room:roomName,user:userName})
		  socket.emit('joinInRoom',roomName,roomMap.get(roomName)) //成功加入后向这个房间的用户告知此消息
        }else{
		  if(roomMap.get(roomName).length>=2){
			socket.emit('fullRoom','该房间已满')
		  }else{
			let list = roomMap.get(roomName)
			list.push(userName)
			roomMap.set(roomName,list)
			socket.join(roomName)
			userRoom.set(socket.id,{room:roomName,user:userName})
			socket.emit('joinInRoom',roomName,roomMap.get(roomName))
			socket.to(roomName).emit('otherUserJoinInRoom',userName)//向这个房间的用户告知有用户加入其中。
			console.log('有其他用户加入该房间',roomName)
		  }
		}//否则查看房间人数，如果大于等于2则向该用户说明房间已满，否则让用户加入该房间，同时向房间内另一用户发送消息
    })//用户加入房间的触发的事件
	socket.on('getOtherUser',(room,user)=>{
		let userList = roomMap.get(room)
		user = userList.filter((a)=>a!=user)
		socket.emit('otherUserJoinInRoom',user[0])
	})

	/*
		媒体协商部分的通信。
	*/
	socket.on('getOfferRoom',(room)=>{
		//判断一下offerMap有无room这个键如果有就意味着本次连接着是接收方，如果没有说明是发送方.如果是接收方还需要将offer传过去。
		let userType = offerMap.has(room)?'get':'send'
		let msg = offerMap.has(room)?offerMap.get(room):''
		socket.emit('getUserType',userType,msg)	
	})
	socket.on('sendOffer',(offer,room)=>{
		offerMap.set(room,offer)
	})
	socket.on('sendAnswer',(answer,room)=>{
		socket.to(room).emit('getAnswer',answer)
	})
	socket.on('candidate',(candidate,room,userType)=>{
		socket.to(room).emit('getCandidate',candidate,userType)
	})
	socket.on('userjoinRoom',(room)=>{
		socket.join(room)
	}) //测试用，之后删
	socket.on('disconnect',()=>{
		offerMap = new Map()
		if(userRoom.has(socket.id)){
			let {room,user} = userRoom.get(socket.id) //用户离开，拿到该用户所在的room和用户名
			if(roomMap.has(room)){
				let roomList = roomMap.get(room) //拿到该room下的用户
				roomList = roomList.filter((a)=>{a!=user})
				if(roomList.length==0){
					roomMap.delete(room)
						let list = []
						let key = roomMap.keys()
						for(let k of key){
							list.push(k)
						}
						io.emit('getRoomList',list)
				} //如果等于后面改房间已经空了，将roomMap相关的键删除,同时通知其他用户目前拥有的房间
			}
		}
		console.log('断开连接')
	}) // 断开连接，将offerMap清空。

	/*聊天室的通信*/
	socket.on('sendChatMsg',(msg,room)=>{
		msg.msgType='get'
		console.log(msg)
		socket.to(room).emit('getChat',msg)
	}) //发送消息
	/*
		与文件传输相关
	*/
	socket.on('uploadFile',(arrayBuffer,index,room,number,timestamp,type,fileName,size)=>{
		socket.emit('uploadFileSliceIndex',index,number,fileName,timestamp)
		socket.to(room).emit('sendFile',arrayBuffer,index,number,timestamp,type,fileName,size)
	})
	socket.on('uploadImage',(arrayBuffer,index,room,number,timestamp,type,fileName,size)=>{
		socket.to(room).emit('sendImage',arrayBuffer,index,number,timestamp,type,fileName,size)
	})
	socket.on('uploadFileStart',(timestamp,total,size,room,msg)=>{
		fileUploadMap.set(timestamp,[])
		msg.msgType = 'get'
		socket.to(room).emit('sendFileStart',timestamp,total,size,msg)
	})
	socket.on('uploadImageStart',(timestamp,total,size,room,msg)=>{
		imageUploadMap.set(timestamp,[])
		msg.msgType = 'get'
		socket.to(room).emit('sendImageStart',timestamp,total,size,msg)
	})
});

httpsServer.listen(443, () => {
	console.log('HTTPS server is running');
});
httpServer.listen(3000,()=>{
	
})
