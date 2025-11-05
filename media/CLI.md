# CMRU API CLI

Command-line interface สำหรับ CMRU API

## การติดตั้ง

```bash
# ติดตั้งแบบ global
npm install -g @cmru-comsci-66/cmru-api

# หรือใช้แบบ npx/bunx (ไม่ต้องติดตั้ง)
bunx @cmru-comsci-66/cmru-api
```

## การใช้งาน

### เริ่ม API Server

```bash
# ใช้ bunx (แนะนำ)
bunx @cmru-comsci-66/cmru-api serve

# ถ้าติดตั้งแล้ว
cmru-api serve

# หรือใช้ npm script ในโปรเจค
bun run serve
```

### กำหนด Port และ Host

```bash
# เปลี่ยน port
PORT=8080 bunx @cmru-comsci-66/cmru-api serve

# เปลี่ยน host (เปิดให้เข้าถึงจากภายนอก)
HOST=0.0.0.0 bunx @cmru-comsci-66/cmru-api serve

# กำหนดทั้งสอง
PORT=8080 HOST=0.0.0.0 bunx @cmru-comsci-66/cmru-api serve
```

## API Endpoints

### Root

**GET** `/`

แสดงข้อมูล API และ endpoints ทั้งหมด

**Response:**

```json
{
	"message": "CMRU API Server",
	"version": "0.1.6",
	"endpoints": {
		"bus": {
			"login": "POST /bus/login",
			"availableBuses": "GET /bus/available",
			"schedule": "GET /bus/schedule"
		},
		"reg": {
			"login": "POST /reg/login",
			"studentInfo": "GET /reg/student",
			"timetable": "GET /reg/timetable"
		}
	}
}
```

### Bus API

#### Login

**POST** `/bus/login`

เข้าสู่ระบบ Bus API

**Body:**

```json
{
	"username": "66143000",
	"password": "yourpassword"
}
```

**Response:**

```json
{
	"success": true,
	"message": "Logged in successfully"
}
```

#### Get Available Buses

**GET** `/bus/available`

ดูรถที่มีให้จองในเดือนปัจจุบัน (ต้อง login ก่อน)

**Response:**

```json
{
	"currentMonth": "2025-11",
	"availableSchedules": [
		{
			"id": 1450,
			"title": "( ไปแม่ริม )",
			"destination": "แม่ริม",
			"destinationType": 1,
			"departureDateTime": "2025-11-03T00:30:00.000Z",
			"departureDate": "2025-11-03T07:30:00",
			"canReserve": false,
			"isReserved": true,
			"requiresLogin": true
		}
	],
	"totalAvailable": 30
}
```

#### Get Schedule

**GET** `/bus/schedule`

ดูตารางการจองรถทั้งหมด (ต้อง login ก่อน)

### Reg API

#### Login

**POST** `/reg/login`

เข้าสู่ระบบ Reg API

**Body:**

```json
{
	"username": "66143000",
	"password": "yourpassword"
}
```

**Response:**

```json
{
	"success": true,
	"message": "Logged in successfully"
}
```

#### Get Student Info

**GET** `/reg/student`

ดูข้อมูลนักศึกษา (ต้อง login ก่อน)

**Response:**

```json
{
	"studentId": "66143000",
	"fullName": "นายพิชวัชร์ จันทะรังษี",
	"thaiName": "นายพิชวัชร์ จันทะรังษี",
	"hasOutstandingPayment": true
}
```

#### Get Timetable

**GET** `/reg/timetable`

ดูตารางเรียน (ต้อง login ก่อน)

## ตัวอย่างการใช้งาน

### ใช้ curl

```bash
# เริ่ม server
bunx @cmru-comsci-66/cmru-api serve

# ดูข้อมูล API
curl http://localhost:3000

# Login Bus API
curl -X POST http://localhost:3000/bus/login \
  -H "Content-Type: application/json" \
  -d '{"username":"66143000","password":"yourpassword"}'

# ดูรถที่มี
curl http://localhost:3000/bus/available

# Login Reg API
curl -X POST http://localhost:3000/reg/login \
  -H "Content-Type: application/json" \
  -d '{"username":"66143000","password":"yourpassword"}'

# ดูข้อมูลนักศึกษา
curl http://localhost:3000/reg/student
```

### ใช้ JavaScript/TypeScript

```typescript
// Login
const loginResponse = await fetch("http://localhost:3000/bus/login", {
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify({
		username: "66143000",
		password: "yourpassword",
	}),
});

const busesResponse = await fetch("http://localhost:3000/bus/available");
const buses = await busesResponse.json();
console.log(buses);
```

## หมายเหตุ

- Session จะถูกเก็บไว้ใน memory ของ server
- ถ้า restart server จะต้อง login ใหม่
- แต่ละ API (Bus/Reg) มี session แยกกัน
- API server รองรับ CORS สำหรับการเรียกใช้จาก browser
