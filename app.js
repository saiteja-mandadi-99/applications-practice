const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const format = require('date-fns/format') // Added date-fns for date formatting
const isValid = require('date-fns/isValid') // Added date-fns for date validation

const app = express()
app.use(express.json())

const databasePath = path.join(__dirname, 'todoApplication.db')
let database = null

const initializeDBAndServer = async () => {
  try {
    database = await open({filename: databasePath, driver: sqlite3.Database})
    app.listen(3000, () => {
      console.log('server running at http://localhost:3000/')
    })
  } catch (err) {
    console.log(`DB Error: ${err.message}`)
    process.exit(1)
  }
}

initializeDBAndServer()

const convertDBObjectToResponseObject = dbObject => {
  return {
    id: dbObject.id,
    todo: dbObject.todo,
    priority: dbObject.priority,
    status: dbObject.status,
    category: dbObject.category,
    dueDate: dbObject.due_date,
  }
}

// Middleware to validate query parameters for /todos/ route
const validateQueryParams = (request, response, next) => {
  const {status, priority, category} = request.query

  if (status && !['TO DO', 'IN PROGRESS', 'DONE'].includes(status)) {
    response.status(400).send('Invalid Todo Status') // Added validation for status
  } else if (priority && !['HIGH', 'MEDIUM', 'LOW'].includes(priority)) {
    response.status(400).send('Invalid Todo Priority') // Added validation for priority
  } else if (category && !['WORK', 'HOME', 'LEARNING'].includes(category)) {
    response.status(400).send('Invalid Todo Category') // Added validation for category
  } else {
    next()
  }
}

// Middleware to validate request body for POST and PUT routes
const validateTodoDetails = (request, response, next) => {
  const {priority, status, category, dueDate} = request.body

  if (priority && !['HIGH', 'MEDIUM', 'LOW'].includes(priority)) {
    response.status(400).send('Invalid Todo Priority') // Added validation for priority
  } else if (status && !['TO DO', 'IN PROGRESS', 'DONE'].includes(status)) {
    response.status(400).send('Invalid Todo Status') // Added validation for status
  } else if (category && !['WORK', 'HOME', 'LEARNING'].includes(category)) {
    response.status(400).send('Invalid Todo Category') // Added validation for category
  } else if (dueDate && !isValid(new Date(dueDate))) {
    response.status(400).send('Invalid Due Date') // Added validation for due date
  } else {
    next()
  }
}

app.get('/todos/', validateQueryParams, async (request, response) => {
  let query = 'SELECT * FROM todo'
  const queryParams = []

  const {status, priority, search_q, category} = request.query

  if (status) {
    queryParams.push(`status = '${status}'`)
  }
  if (priority) {
    queryParams.push(`priority = '${priority}'`)
  }
  if (search_q) {
    queryParams.push(`todo LIKE '%${search_q}%'`)
  }
  if (category) {
    queryParams.push(`category = '${category}'`)
  }

  if (queryParams.length > 0) {
    query += ` WHERE ${queryParams.join(' AND ')}`
  }

  try {
    const todos = await database.all(query)
    response.send(todos.map(todo => convertDBObjectToResponseObject(todo)))
  } catch (error) {
    console.log(`Internal Error: ${error.message}`)
    response.status(500).send('Internal Server Error')
  }
})

app.get('/todos/:todoId/', async (request, response) => {
  const {todoId} = request.params
  try {
    const todo = await database.get(`SELECT * FROM todo WHERE id = ?`, [todoId])
    response.send(convertDBObjectToResponseObject(todo))
  } catch (error) {
    console.log(`Internal Error: ${error.message}`)
    response.status(500).send('Internal Server Error')
  }
})

app.get('/agenda/', async (request, response) => {
  const {date} = request.query

  if (!isValid(new Date(date))) {
    response.status(400).send('Invalid Due Date') // Added validation for date query
    return
  }

  const formattedDate = format(new Date(date), 'yyyy-MM-dd')

  try {
    const todos = await database.all(`SELECT * FROM todo WHERE due_date = ?`, [
      formattedDate,
    ])
    response.send(todos.map(todo => convertDBObjectToResponseObject(todo)))
  } catch (error) {
    console.log(`Internal Error: ${error.message}`)
    response.status(500).send('Internal Server Error')
  }
})

app.post('/todos/', validateTodoDetails, async (request, response) => {
  const {id, todo, priority, status, category, dueDate} = request.body
  const formattedDate = format(new Date(dueDate), 'yyyy-MM-dd')

  try {
    await database.run(
      `INSERT INTO todo (id, todo, priority, status, category, due_date) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, todo, priority, status, category, formattedDate],
    )
    response.send('Todo Successfully Added')
  } catch (error) {
    console.log(`Internal Error: ${error.message}`)
    response.status(500).send('Internal Server Error')
  }
})

app.put('/todos/:todoId/', validateTodoDetails, async (request, response) => {
  const {todoId} = request.params
  const {status, priority, todo, category, dueDate} = request.body

  const previousTodo = await database.get(`SELECT * FROM todo WHERE id = ?`, [
    todoId,
  ])

  const updatedTodo = {
    ...previousTodo,
    status: status !== undefined ? status : previousTodo.status,
    priority: priority !== undefined ? priority : previousTodo.priority,
    todo: todo !== undefined ? todo : previousTodo.todo,
    category: category !== undefined ? category : previousTodo.category,
    dueDate:
      dueDate !== undefined
        ? format(new Date(dueDate), 'yyyy-MM-dd')
        : previousTodo.due_date,
  }

  await database.run(
    `UPDATE todo SET todo = ?, priority = ?, status = ?, category = ?, due_date = ? WHERE id = ?`,
    [
      updatedTodo.todo,
      updatedTodo.priority,
      updatedTodo.status,
      updatedTodo.category,
      updatedTodo.dueDate,
      todoId,
    ],
  )

  if (status)
    response.send('Status Updated') // Added specific response for status update
  else if (priority)
    response.send(
      'Priority Updated',
    ) // Added specific response for priority update
  else if (category)
    response.send(
      'Category Updated',
    ) // Added specific response for category update
  else if (dueDate)
    response.send(
      'Due Date Updated',
    ) // Added specific response for due date update
  else response.send('Todo Updated')
})

app.delete('/todos/:todoId/', async (request, response) => {
  const {todoId} = request.params
  try {
    await database.run(`DELETE FROM todo WHERE id = ?`, [todoId])
    response.send('Todo Deleted')
  } catch (error) {
    console.log(`Internal Error: ${error.message}`)
    response.status(500).send('Internal Server Error')
  }
})

module.exports = app
