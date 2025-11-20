// server.js
// Single-file MongoDB To-Do App (backend + frontend served from same file)
// ES Modules required (package.json should have "type": "module")
// -------------------------------
// Usage:
//   MONGO_URI="your_mongodb_uri" node server.js
// -------------------------------

import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';

// === Configuration ===
const ENV_PORT = process.env.PORT || 5000;
const ENV_MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const APP_DB_NAME = 'stark_todo_db_v1';        // unique DB name
const APP_COLLECTION = 'stark_tasks_v1';      // unique collection name

// === App setup ===
const app = express();
app.use(cors());               // allow cross-origin (can be restricted in prod)
app.use(express.json({ limit: '2mb' })); // parse JSON body

// === MongoDB connection helper ===
let mongoClient;
let tasksCollection;

/**
 * startMongoConnect
 * Connects to MongoDB and initializes the collection handle.
 * Retries on failure.
 */
async function startMongoConnect() {
  try {
    mongoClient = new MongoClient(ENV_MONGO);
    await mongoClient.connect();
    const db = mongoClient.db(APP_DB_NAME);
    tasksCollection = db.collection(APP_COLLECTION);

    // Add an index for createdAt for faster sorting (safe if exists).
    await tasksCollection.createIndex({ createdAt: -1 });

    console.log('MongoDB connected to', ENV_MONGO, 'DB:', APP_DB_NAME);
  } catch (err) {
    console.error('MongoDB connection failed:', err);
    process.exit(1);
  }
}

// === Utility validators ===
function validateTaskPayload(payload) {
  if (!payload || typeof payload.text !== 'string') return false;
  const txt = payload.text.trim();
  if (!txt || txt.length > 2000) return false;
  return true;
}

// === API: REST endpoints for CRUD ===
// GET /api/tasks        -> return array of tasks (newest first)
// POST /api/tasks       -> create a task { text }
// PUT /api/tasks/:id    -> update a task { text }
// DELETE /api/tasks/:id -> delete a task

// GET all tasks
app.get('/api/tasks', async (req, res) => {
  try {
    const docs = await tasksCollection.find({}).sort({ createdAt: -1 }).toArray();
    res.json(docs);
  } catch (err) {
    console.error('fetchAllTasks error', err);
    res.status(500).json({ error: 'Failed to fetch tasks.' });
  }
});

// POST create
app.post('/api/tasks', async (req, res) => {
  try {
    if (!validateTaskPayload(req.body)) {
      return res.status(400).json({ error: 'Invalid payload. "text" required.' });
    }
    const text = req.body.text.trim();
    const doc = {
      text,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await tasksCollection.insertOne(doc);
    res.status(201).json({ _id: result.insertedId, ...doc });
  } catch (err) {
    console.error('createTask error', err);
    res.status(500).json({ error: 'Failed to create task.' });
  }
});

// PUT update
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
    if (!validateTaskPayload(req.body)) {
      return res.status(400).json({ error: 'Invalid payload. "text" required.' });
    }
    const text = req.body.text.trim();
    const result = await tasksCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { text, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Task not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('updateTask error', err);
    res.status(500).json({ error: 'Failed to update task.' });
  }
});

// DELETE
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
    const result = await tasksCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Task not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('deleteTask error', err);
    res.status(500).json({ error: 'Failed to delete task.' });
  }
});

// === Serve Single-File Frontend ===
// The HTML/JS/CSS below is served at root '/'. It's intentionally embedded so
// the entire app lives in this single server.js file (suitable for quick deploy).
app.get('/', (req, res) => {
  res.type('html').send(HTML_PAGE);
});

// === Health endpoint ===
app.get('/healthz', (req, res) => res.json({ ok: true }));

// === Start server after MongoDB connects ===
async function startServer() {
  await startMongoConnect();
  app.listen(ENV_PORT, () => {
    console.log(`Server listening on http://localhost:${ENV_PORT} (or on deployed host)`);
  });
}

// Kick off
startServer().catch(err => {
  console.error('Failed to start server', err);
  process.exit(1);
});

// ==========================
// Frontend HTML (embedded)
// ==========================
const HTML_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Stark To-Do (MongoDB single-file)</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <!-- Bootstrap (CDN) -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <!-- jQuery (CDN) -->
  <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
  <style>
    body { background: #f4f6f9; padding-top: 36px; }
    .card-center { max-width: 760px; margin: 0 auto; }
    .task-text { word-break: break-word; }
    .muted-small { font-size: .85rem; color: #6c757d; }
    .empty-note { text-align:center; color:#6c757d; padding:20px 0; }
  </style>
</head>
<body>
  <div class="card card-center shadow-sm">
    <div class="card-body">
      <h4>Stark To-Do — MongoDB (single-file)</h4>
      <p class="muted-small">Backend + frontend served from one Node.js file. Uses MongoDB for persistence.</p>

      <form id="starkForm" class="form-inline mb-3" onsubmit="return false;">
        <input id="starkInput" class="form-control mr-2 flex-grow-1" style="width:100%;" maxlength="1000" placeholder="Add new task..." />
        <button id="starkAddBtn" class="btn btn-primary">Add</button>
      </form>

      <div class="mb-2 d-flex justify-content-between align-items-center">
        <div class="muted-small">All changes persist to MongoDB collection: <code>${APP_COLLECTION}</code></div>
        <div>
          <button id="starkRefreshBtn" class="btn btn-sm btn-outline-secondary">Refresh</button>
        </div>
      </div>

      <ul id="starkList" class="list-group"></ul>
      <div id="starkEmpty" class="empty-note" style="display:none;">No tasks yet — add one above.</div>
    </div>
  </div>

  <script>
    // Frontend JS (jQuery) for interacting with the server-side API
    // Unique function/variable prefixes: "stark_..." to avoid collisions

    const stark_apiBase = '/api/tasks';

    // Escape text for safe insertion
    function stark_escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function(m) {
        return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];
      });
    }

    // Render list of tasks
    function stark_renderTasks(tasks) {
      const $list = $('#starkList');
      $list.empty();
      if (!Array.isArray(tasks) || tasks.length === 0) {
        $('#starkEmpty').show();
        return;
      } else {
        $('#starkEmpty').hide();
      }

      tasks.forEach(task => {
        const id = task._id || task.id || '';
        const text = stark_escapeHtml(task.text || '');
        const created = task.createdAt ? new Date(task.createdAt).toLocaleString() : '';

        const $li = $(\`
          <li class="list-group-item d-flex align-items-start" data-id="\${id}">
            <div class="flex-grow-1">
              <div class="task-text" data-text>\${text}</div>
              <div class="muted-small mt-1">Created: \${created}</div>
            </div>
            <div class="ml-3 btn-group">
              <button class="btn btn-sm btn-outline-secondary stark-edit">Edit</button>
              <button class="btn btn-sm btn-outline-danger stark-delete">Delete</button>
            </div>
          </li>
        \`);

        // Edit handler (inline)
        $li.find('.stark-edit').on('click', function(){
          stark_invokeEdit(id, $li, task.text);
        });

        // Delete handler
        $li.find('.stark-delete').on('click', function(){
          if (!confirm('Delete this task?')) return;
          $.ajax({
            url: stark_apiBase + '/' + id,
            method: 'DELETE'
          }).done(function(){ stark_loadTasks(); })
            .fail(function(){ alert('Failed to delete task'); });
        });

        $list.append($li);
      });
    }

    // Fetch tasks from server
    function stark_loadTasks(){
      $.get(stark_apiBase)
        .done(function(data){
          stark_renderTasks(data);
        })
        .fail(function(){
          alert('Failed to load tasks from server.');
        });
    }

    // Add a new task
    function stark_addTask(text){
      if (!text || !text.trim()) return;
      $.ajax({
        url: stark_apiBase,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ text: text.trim() })
      }).done(function(){
        $('#starkInput').val('').focus();
        stark_loadTasks();
      }).fail(function(){
        alert('Failed to add task.');
      });
    }

    // Inline edit UI
    function stark_invokeEdit(id, $li, currentText){
      const $content = $li.find('[data-text]');
      const $editor = $(\`
        <div class="w-100">
          <input class="form-control mb-2 stark-edit-input" maxlength="1000" />
          <div class="text-right">
            <button class="btn btn-sm btn-primary stark-save">Save</button>
            <button class="btn btn-sm btn-secondary stark-cancel">Cancel</button>
          </div>
        </div>
      \`);
      $editor.find('input').val(currentText).focus().select();
      $content.hide().after($editor);
      $li.find('.stark-edit, .stark-delete').prop('disabled', true);

      $editor.find('.stark-save').on('click', function(){
        const newVal = $editor.find('input').val();
        if (!newVal || !newVal.trim()) { alert('Task cannot be empty'); return; }
        $.ajax({
          url: stark_apiBase + '/' + id,
          method: 'PUT',
          contentType: 'application/json',
          data: JSON.stringify({ text: newVal.trim() })
        }).done(function(){
          stark_loadTasks();
        }).fail(function(){
          alert('Failed to update task');
        });
      });

      $editor.find('.stark-cancel').on('click', function(){
        $editor.remove();
        $content.show();
        $li.find('.stark-edit, .stark-delete').prop('disabled', false);
      });
    }

    // DOM wiring
    $(function(){
      // initial load
      stark_loadTasks();

      // Add button
      $('#starkAddBtn').on('click', function(e){
        e.preventDefault();
        const val = $('#starkInput').val();
        stark_addTask(val);
      });

      // Enter in input
      $('#starkInput').on('keydown', function(e){
        if (e.key === 'Enter') {
          e.preventDefault();
          $('#starkAddBtn').click();
        }
      });

      // Refresh
      $('#starkRefreshBtn').on('click', function(){ stark_loadTasks(); });
    });
  </script>
</body>
</html>`;
