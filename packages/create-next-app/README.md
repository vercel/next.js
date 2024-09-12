<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tailoring Dashboard</title>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { font-family: 'Poppins', sans-serif; }
        .material-animation {
            animation: rotate 4s linear infinite;
        }
        @keyframes rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body class="bg-gray-100">
    <header class="bg-blue-500 text-white p-4">
        <h1 class="text-3xl font-bold">Tailoring Dashboard</h1>
    </header>
    
    <div class="flex">
        <!-- Sidebar -->
        <aside class="w-1/5 bg-gray-800 text-white p-4">
            <ul>
                <li class="mb-4"><a href="#" class="text-lg font-semibold">Customers</a></li>
                <li class="mb-4"><a href="#" class="text-lg font-semibold">Due Dates</a></li>
                <li><a href="#" class="text-lg font-semibold">Sewing Materials</a></li>
            </ul>
        </aside>

        <!-- Main content -->
        <main class="w-4/5 p-6">
            <!-- Customers Section -->
            <section id="customers" class="mb-8">
                <h2 class="text-2xl font-bold mb-4">Customer Measurements</h2>
                <table class="w-full bg-white shadow-md rounded-md">
                    <thead class="bg-gray-200">
                        <tr>
                            <th class="p-3 text-left">Name</th>
                            <th class="p-3 text-left">Height</th>
                            <th class="p-3 text-left">Waist</th>
                            <th class="p-3 text-left">Bust</th>
                            <th class="p-3 text-left">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="customerList">
                        <!-- Dynamic Customer Rows -->
                    </tbody>
                </table>
            </section>

            <!-- Due Dates Section -->
            <section id="dueDates" class="mb-8">
                <h2 class="text-2xl font-bold mb-4">Due Dates</h2>
                <ul id="dueDatesList" class="bg-white p-4 shadow-md rounded-md">
                    <!-- Dynamic Due Dates -->
                </ul>
            </section>

            <!-- Sewing Materials Animation -->
            <section id="sewingMaterials">
                <h2 class="text-2xl font-bold mb-4">Sewing Materials</h2>
                <div class="flex space-x-8">
                    <img src="https://source.unsplash.com/random/100x100?scissors" alt="Scissors" class="material-animation w-24 h-24">
                    <img src="https://source.unsplash.com/random/100x100?thread" alt="Thread" class="material-animation w-24 h-24">
                    <img src="https://source.unsplash.com/random/100x100?fabric" alt="Fabric" class="material-animation w-24 h-24">
                </div>
            </section>
        </main>
    </div>

    <script src="script.js"></script>
</body>
</html>
<index>
document.addEventListener("DOMContentLoaded", () => {
    const customers = [
        { name: 'John Doe', height: '6ft', waist: '32in', bust: '40in' },
        { name: 'Jane Smith', height: '5.6ft', waist: '28in', bust: '36in' }
    ];

    const dueDates = [
        { customer: 'John Doe', due: '2024-10-12' },
        { customer: 'Jane Smith', due: '2024-10-20' }
    ];

    // Populate Customer Measurements
    const customerList = document.getElementById('customerList');
    customers.forEach(customer => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="p-3">${customer.name}</td>
            <td class="p-3">${customer.height}</td>
            <td class="p-3">${customer.waist}</td>
            <td class="p-3">${customer.bust}</td>
            <td class="p-3">
                <button class="bg-blue-500 text-white px-3 py-1 rounded-md">Edit</button>
                <button class="bg-red-500 text-white px-3 py-1 rounded-md">Delete</button>
            </td>
        `;
        customerList.appendChild(row);
    });

    // Populate Due Dates
    const dueDatesList = document.getElementById('dueDatesList');
    dueDates.forEach(due => {
        const li = document.createElement('li');
        li.className = 'mb-2';
        li.innerHTML = `<strong>${due.customer}</strong> - Due on: ${due.due}`;
        dueDatesList.appendChild(li);
    });
});
