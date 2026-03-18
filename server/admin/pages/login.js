export function loginPage(error = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Login — AAFM</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@500;600&family=Fira+Sans:wght@400;500&display=swap" rel="stylesheet">
  <style>body { font-family: 'Fira Sans', sans-serif; background: #F8FAFC; }</style>
</head>
<body class="min-h-screen flex items-center justify-center">
  <div class="bg-white border border-slate-200 rounded-xl p-8 w-full max-w-sm shadow-sm">
    <h1 class="text-xl font-semibold text-slate-900 mb-1" style="font-family:'Fira Code',monospace">AAFM Admin</h1>
    <p class="text-sm text-slate-500 mb-6">Sign in to manage teams and users</p>
    ${error ? `<div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">${error}</div>` : ""}
    <form method="POST" action="/admin/login" class="flex flex-col gap-4">
      <div>
        <label for="password" class="block text-sm font-medium text-slate-700 mb-1">Password</label>
        <input
          type="password"
          id="password"
          name="password"
          required
          autofocus
          class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Enter admin password"
        >
      </div>
      <button
        type="submit"
        class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg text-sm transition-colors cursor-pointer"
      >
        Sign in
      </button>
    </form>
  </div>
</body>
</html>`;
}
