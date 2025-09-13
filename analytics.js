// Analytics Dashboard JavaScript
import { auth, db } from './firebase-config.js';
import { collection, getDocs, query, where, orderBy, limit, startAfter, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';

class AnalyticsDashboard {
    constructor() {
        this.charts = {};
        this.data = {
            sales: [],
            users: [],
            products: [],
            payments: []
        };
        this.dateRange = {
            start: null,
            end: null
        };
        
        // Check if user is admin before initializing
        this.checkAdminAccess();
    }

    async checkAdminAccess() {
        try {
            
            onAuthStateChanged(auth, async (user) => {
                console.log('Analytics: Auth state changed, user:', user ? user.email : 'No user');
                
                if (user) {
                    console.log('Analytics: Checking admin status for user:', user.uid);
                    
                    // Check if user is admin using the same logic as admin.js
                    let isAdmin = false;
                    
                    try {
                        // Check admins collection
                        console.log('Analytics: Checking admins collection...');
                        const adminDoc = await getDoc(doc(db, 'admins', user.uid));
                        console.log('Analytics: Admin doc exists:', adminDoc.exists());
                        if (adminDoc.exists()) {
                            const adminData = adminDoc.data();
                            console.log('Analytics: Admin data:', adminData);
                            if (adminData?.active === true) {
                                isAdmin = true;
                                console.log('Analytics: User is admin via admins collection');
                            }
                        }
                    } catch (error) {
                        console.log('Analytics: Error checking admins collection:', error);
                    }
                    
                    // If not admin from admins collection, check user role
                    if (!isAdmin) {
                        try {
                            console.log('Analytics: Checking users collection...');
                            const userDoc = await getDoc(doc(db, 'users', user.uid));
                            console.log('Analytics: User doc exists:', userDoc.exists());
                            if (userDoc.exists()) {
                                const userData = userDoc.data();
                                console.log('Analytics: User data:', userData);
                                if (userData?.role === 'admin') {
                                    isAdmin = true;
                                    console.log('Analytics: User is admin via users collection');
                                }
                            }
                        } catch (error) {
                            console.log('Analytics: Error checking users collection:', error);
                        }
                    }
                    
                    console.log('Analytics: Final admin status:', isAdmin);
                    
                    if (isAdmin) {
                        // User is admin, initialize dashboard
                        console.log('Analytics: Initializing dashboard...');
                        this.init();
                    } else {
                        // User is not admin, show access denied
                        console.log('Analytics: Access denied - not admin');
                        this.showAccessDenied();
                    }
                } else {
                    // User not logged in, show access denied
                    console.log('Analytics: Access denied - not logged in');
                    this.showAccessDenied();
                }
            });
        } catch (error) {
            console.error('Analytics: Error checking admin access:', error);
            this.showAccessDenied();
        }
    }

    showAccessDenied() {
        // Replace the entire page content since there's no navbar
        document.body.innerHTML = `
            <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%);
                color: #e2e8f0;
                font-family: 'Inter', sans-serif;
                text-align: center;
                padding: 2rem;
            ">
                <div style="
                    background: #1a1a2e;
                    border: 1px solid #2d2d44;
                    border-radius: 12px;
                    padding: 3rem;
                    max-width: 500px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                ">
                    <div style="
                        width: 80px;
                        height: 80px;
                        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0 auto 2rem;
                        font-size: 2rem;
                        color: white;
                    ">
                        <i class="fas fa-lock"></i>
                    </div>
                    <h1 style="
                        font-size: 2rem;
                        font-weight: 700;
                        margin: 0 0 1rem 0;
                        color: #e2e8f0;
                    ">Access Denied</h1>
                    <p style="
                        color: #94a3b8;
                        margin: 0 0 2rem 0;
                        line-height: 1.6;
                    ">You don't have permission to access the Analytics dashboard. This page is restricted to administrators only.</p>
                    <div style="display: flex; gap: 1rem; justify-content: center;">
                        <a href="login.html" style="
                            background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
                            color: white;
                            padding: 0.75rem 1.5rem;
                            border-radius: 8px;
                            text-decoration: none;
                            font-weight: 600;
                            transition: all 0.3s ease;
                        ">Login</a>
                        <a href="index.html" style="
                            background: #2d2d44;
                            color: #e2e8f0;
                            padding: 0.75rem 1.5rem;
                            border-radius: 8px;
                            text-decoration: none;
                            font-weight: 600;
                            transition: all 0.3s ease;
                        ">Go Home</a>
                    </div>
                </div>
            </div>
        `;
    }

    async init() {
        try {
            // Set default date range (last 30 days)
            this.setDefaultDateRange();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Load initial data
            await this.loadAllData();
            
            // Initialize charts
            this.initializeCharts();
            
            // Update dashboard
            this.updateDashboard();
            
        } catch (error) {
            console.error('Error initializing analytics dashboard:', error);
            this.showError('Failed to initialize analytics dashboard');
        }
    }

    setDefaultDateRange() {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        
        document.getElementById('startDate').value = this.formatDate(startDate);
        document.getElementById('endDate').value = this.formatDate(endDate);
        
        this.dateRange.start = startDate;
        this.dateRange.end = endDate;
    }

    setupEventListeners() {
        // Date range controls
        document.getElementById('applyDateRange').addEventListener('click', () => {
            this.applyDateRange();
        });
        
        document.getElementById('resetDateRange').addEventListener('click', () => {
            this.resetDateRange();
        });
        
        // Chart period controls
        document.getElementById('revenuePeriod').addEventListener('change', (e) => {
            this.updateRevenueChart(parseInt(e.target.value));
        });
        
        // Report actions
        document.getElementById('exportReport').addEventListener('click', () => {
            this.exportReport();
        });
        
        document.getElementById('refreshData').addEventListener('click', () => {
            this.refreshData();
        });
    }

    async loadAllData() {
        try {
            this.showLoading();
            
            // Load data in parallel
            const [salesData, usersData, productsData, paymentsData] = await Promise.all([
                this.loadSalesData(db),
                this.loadUsersData(db),
                this.loadProductsData(db),
                this.loadPaymentsData(db)
            ]);
            
            this.data.sales = salesData;
            this.data.users = usersData;
            this.data.products = productsData;
            this.data.payments = paymentsData;
            
        } catch (error) {
            console.error('Error loading data:', error);
            this.showError('Failed to load analytics data');
        }
    }

    async loadSalesData(db) {
        try {
            const salesRef = collection(db, 'payments');
            let q = query(
                salesRef,
                where('status', '==', 'completed'),
                orderBy('createdAt', 'desc')
            );
            
            // Apply date range filter if set
            if (this.dateRange.start && this.dateRange.end) {
                q = query(
                    salesRef,
                    where('status', '==', 'completed'),
                    where('createdAt', '>=', this.dateRange.start),
                    where('createdAt', '<=', this.dateRange.end),
                    orderBy('createdAt', 'desc')
                );
            }
            
            const querySnapshot = await getDocs(q);
            
            return querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Error loading sales data:', error);
            return [];
        }
    }

    async loadUsersData(db) {
        try {
            const usersRef = collection(db, 'users');
            let q = query(usersRef, orderBy('createdAt', 'desc'));
            
            // Apply date range filter if set
            if (this.dateRange.start && this.dateRange.end) {
                q = query(
                    usersRef,
                    where('createdAt', '>=', this.dateRange.start),
                    where('createdAt', '<=', this.dateRange.end),
                    orderBy('createdAt', 'desc')
                );
            }
            
            const querySnapshot = await getDocs(q);
            
            return querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Error loading users data:', error);
            return [];
        }
    }

    async loadProductsData(db) {
        try {
            const productsRef = collection(db, 'products');
            const q = query(productsRef, where('status', '==', 'active'));
            const querySnapshot = await getDocs(q);
            
            return querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Error loading products data:', error);
            return [];
        }
    }

    async loadPaymentsData(db) {
        try {
            const paymentsRef = collection(db, 'payments');
            const q = query(paymentsRef, orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            
            return querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Error loading payments data:', error);
            return [];
        }
    }

    initializeCharts() {
        this.initializeRevenueChart();
        this.initializeCategoryChart();
        this.initializeUserGrowthChart();
        this.initializeTopProductsChart();
    }

    initializeRevenueChart() {
        const ctx = document.getElementById('revenueChart').getContext('2d');
        
        this.charts.revenue = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Revenue',
                    data: [],
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#8b5cf6',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#e2e8f0'
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#94a3b8'
                        },
                        grid: {
                            color: '#2d2d44'
                        }
                    },
                    y: {
                        ticks: {
                            color: '#94a3b8',
                            callback: function(value) {
                                return 'Rs ' + value.toLocaleString();
                            }
                        },
                        grid: {
                            color: '#2d2d44'
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
        
        this.updateRevenueChart(30);
    }

    initializeCategoryChart() {
        const ctx = document.getElementById('categoryChart').getContext('2d');
        
        this.charts.category = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: [
                        '#8b5cf6',
                        '#6366f1',
                        '#3b82f6',
                        '#06b6d4',
                        '#10b981',
                        '#f59e0b',
                        '#ef4444'
                    ],
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#e2e8f0',
                            padding: 20,
                            usePointStyle: true
                        }
                    }
                }
            }
        });
        
        this.updateCategoryChart();
    }

    initializeUserGrowthChart() {
        const ctx = document.getElementById('userGrowthChart').getContext('2d');
        
        this.charts.userGrowth = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'New Users',
                    data: [],
                    backgroundColor: 'rgba(139, 92, 246, 0.8)',
                    borderColor: '#8b5cf6',
                    borderWidth: 1,
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#e2e8f0'
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#94a3b8'
                        },
                        grid: {
                            color: '#2d2d44'
                        }
                    },
                    y: {
                        ticks: {
                            color: '#94a3b8'
                        },
                        grid: {
                            color: '#2d2d44'
                        }
                    }
                }
            }
        });
        
        this.updateUserGrowthChart();
    }

    initializeTopProductsChart() {
        const ctx = document.getElementById('topProductsChart').getContext('2d');
        
        this.charts.topProducts = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Sales',
                    data: [],
                    backgroundColor: 'rgba(99, 102, 241, 0.8)',
                    borderColor: '#6366f1',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: {
                        labels: {
                            color: '#e2e8f0'
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#94a3b8'
                        },
                        grid: {
                            color: '#2d2d44'
                        }
                    },
                    y: {
                        ticks: {
                            color: '#94a3b8'
                        },
                        grid: {
                            color: '#2d2d44'
                        }
                    }
                }
            }
        });
        
        this.updateTopProductsChart();
    }

    updateRevenueChart(days = 30) {
        const filteredData = this.getFilteredData(days);
        const revenueData = this.calculateRevenueByDay(filteredData);
        
        this.charts.revenue.data.labels = revenueData.labels;
        this.charts.revenue.data.datasets[0].data = revenueData.values;
        this.charts.revenue.update();
    }

    updateCategoryChart() {
        const categoryData = this.calculateSalesByCategory();
        
        this.charts.category.data.labels = categoryData.labels;
        this.charts.category.data.datasets[0].data = categoryData.values;
        this.charts.category.update();
    }

    updateUserGrowthChart() {
        const userGrowthData = this.calculateUserGrowth();
        
        this.charts.userGrowth.data.labels = userGrowthData.labels;
        this.charts.userGrowth.data.datasets[0].data = userGrowthData.values;
        this.charts.userGrowth.update();
    }

    updateTopProductsChart() {
        const topProductsData = this.calculateTopProducts();
        
        this.charts.topProducts.data.labels = topProductsData.labels;
        this.charts.topProducts.data.datasets[0].data = topProductsData.values;
        this.charts.topProducts.update();
    }

    getFilteredData(days) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        return this.data.payments.filter(payment => {
            const paymentDate = payment.createdAt?.toDate ? payment.createdAt.toDate() : new Date(payment.createdAt);
            return paymentDate >= startDate && paymentDate <= endDate && payment.status === 'completed';
        });
    }

    calculateRevenueByDay(data) {
        const revenueMap = new Map();
        
        data.forEach(payment => {
            const date = payment.createdAt?.toDate ? payment.createdAt.toDate() : new Date(payment.createdAt);
            const dateKey = this.formatDate(date);
            const amount = parseFloat(payment.totalAmount) || 0;
            
            revenueMap.set(dateKey, (revenueMap.get(dateKey) || 0) + amount);
        });
        
        const sortedEntries = Array.from(revenueMap.entries()).sort((a, b) => 
            new Date(a[0]) - new Date(b[0])
        );
        
        return {
            labels: sortedEntries.map(entry => entry[0]),
            values: sortedEntries.map(entry => entry[1])
        };
    }

    calculateSalesByCategory() {
        const categoryMap = new Map();
        
        this.data.payments.forEach(payment => {
            if (payment.status === 'completed' && payment.cartItems) {
                payment.cartItems.forEach(item => {
                    const category = item.productCategory || 'Unknown';
                    const amount = parseFloat(item.totalPrice) || 0;
                    
                    categoryMap.set(category, (categoryMap.get(category) || 0) + amount);
                });
            }
        });
        
        const sortedEntries = Array.from(categoryMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 7);
        
        return {
            labels: sortedEntries.map(entry => this.formatCategoryName(entry[0])),
            values: sortedEntries.map(entry => entry[1])
        };
    }

    calculateUserGrowth() {
        const userGrowthMap = new Map();
        
        this.data.users.forEach(user => {
            const date = user.createdAt?.toDate ? user.createdAt.toDate() : new Date(user.createdAt);
            const dateKey = this.formatDate(date);
            
            userGrowthMap.set(dateKey, (userGrowthMap.get(dateKey) || 0) + 1);
        });
        
        const sortedEntries = Array.from(userGrowthMap.entries())
            .sort((a, b) => new Date(a[0]) - new Date(b[0]))
            .slice(-30);
        
        return {
            labels: sortedEntries.map(entry => entry[0]),
            values: sortedEntries.map(entry => entry[1])
        };
    }

    calculateTopProducts() {
        const productMap = new Map();
        
        this.data.payments.forEach(payment => {
            if (payment.status === 'completed' && payment.cartItems) {
                payment.cartItems.forEach(item => {
                    const productName = item.productName || 'Unknown Product';
                    const quantity = parseInt(item.quantity) || 0;
                    
                    productMap.set(productName, (productMap.get(productName) || 0) + quantity);
                });
            }
        });
        
        const sortedEntries = Array.from(productMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        
        return {
            labels: sortedEntries.map(entry => entry[0]),
            values: sortedEntries.map(entry => entry[1])
        };
    }

    updateDashboard() {
        this.updateMetrics();
        this.updateSalesTable();
        this.updateUserAnalytics();
        this.updateInsights();
    }

    updateMetrics() {
        const metrics = this.calculateMetrics();
        
        document.getElementById('totalRevenue').textContent = `Rs ${metrics.totalRevenue.toLocaleString()}`;
        document.getElementById('totalOrders').textContent = metrics.totalOrders.toLocaleString();
        document.getElementById('totalUsers').textContent = metrics.totalUsers.toLocaleString();
        document.getElementById('conversionRate').textContent = `${metrics.conversionRate.toFixed(1)}%`;
        
        // Update change indicators
        this.updateMetricChange('revenueChange', metrics.revenueChange);
        this.updateMetricChange('ordersChange', metrics.ordersChange);
        this.updateMetricChange('usersChange', metrics.usersChange);
        this.updateMetricChange('conversionChange', metrics.conversionChange);
    }

    calculateMetrics() {
        const completedPayments = this.data.payments.filter(p => p.status === 'completed');
        const totalRevenue = completedPayments.reduce((sum, payment) => 
            sum + (parseFloat(payment.totalAmount) || 0), 0);
        
        const totalOrders = completedPayments.length;
        const totalUsers = this.data.users.length;
        
        // Calculate conversion rate (users who made purchases / total users)
        const usersWithPurchases = new Set(completedPayments.map(p => p.userId)).size;
        const conversionRate = totalUsers > 0 ? (usersWithPurchases / totalUsers) * 100 : 0;
        
        // Calculate changes (simplified - comparing with previous period)
        const previousPeriodData = this.getPreviousPeriodData();
        
        return {
            totalRevenue,
            totalOrders,
            totalUsers,
            conversionRate,
            revenueChange: this.calculatePercentageChange(totalRevenue, previousPeriodData.revenue),
            ordersChange: this.calculatePercentageChange(totalOrders, previousPeriodData.orders),
            usersChange: this.calculatePercentageChange(totalUsers, previousPeriodData.users),
            conversionChange: this.calculatePercentageChange(conversionRate, previousPeriodData.conversion)
        };
    }

    getPreviousPeriodData() {
        // Simplified - in real implementation, you'd compare with actual previous period data
        return {
            revenue: 0,
            orders: 0,
            users: 0,
            conversion: 0
        };
    }

    calculatePercentageChange(current, previous) {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
    }

    updateMetricChange(elementId, change) {
        const element = document.getElementById(elementId);
        const isPositive = change >= 0;
        
        element.textContent = `${isPositive ? '+' : ''}${change.toFixed(1)}%`;
        element.className = `metric-change ${isPositive ? 'positive' : 'negative'}`;
    }

    updateSalesTable() {
        const tbody = document.getElementById('salesTableBody');
        const recentSales = this.data.payments
            .filter(p => p.status === 'completed')
            .slice(0, 10);
        
        tbody.innerHTML = recentSales.map(payment => {
            const date = payment.createdAt?.toDate ? payment.createdAt.toDate() : new Date(payment.createdAt);
            const products = payment.cartItems ? 
                payment.cartItems.map(item => item.productName).join(', ') : 'N/A';
            
            return `
                <tr>
                    <td>${payment.orderId || payment.id}</td>
                    <td>${payment.customerName || 'Guest'}</td>
                    <td>${products}</td>
                    <td>Rs ${(parseFloat(payment.totalAmount) || 0).toLocaleString()}</td>
                    <td>${this.formatDate(date)}</td>
                    <td><span class="status-badge completed">Completed</span></td>
                </tr>
            `;
        }).join('');
    }

    updateUserAnalytics() {
        // Active users (24h) - simplified calculation
        const activeUsers24h = this.data.users.filter(user => {
            const lastActive = user.lastActive?.toDate ? user.lastActive.toDate() : new Date(user.createdAt);
            const hoursSinceActive = (new Date() - lastActive) / (1000 * 60 * 60);
            return hoursSinceActive <= 24;
        }).length;
        
        // New registrations (last 7 days)
        const newRegistrations = this.data.users.filter(user => {
            const createdAt = user.createdAt?.toDate ? user.createdAt.toDate() : new Date(user.createdAt);
            const daysSinceCreated = (new Date() - createdAt) / (1000 * 60 * 60 * 24);
            return daysSinceCreated <= 7;
        }).length;
        
        // Returning users (users with multiple orders)
        const userOrderCounts = new Map();
        this.data.payments.forEach(payment => {
            if (payment.status === 'completed' && payment.userId) {
                userOrderCounts.set(payment.userId, (userOrderCounts.get(payment.userId) || 0) + 1);
            }
        });
        const returningUsers = Array.from(userOrderCounts.values()).filter(count => count > 1).length;
        
        document.getElementById('activeUsers24h').textContent = activeUsers24h.toLocaleString();
        document.getElementById('newRegistrations').textContent = newRegistrations.toLocaleString();
        document.getElementById('returningUsers').textContent = returningUsers.toLocaleString();
        
        // Device analytics (simplified - would need actual device data)
        document.getElementById('mobilePercentage').textContent = '65%';
        document.getElementById('desktopPercentage').textContent = '30%';
        document.getElementById('tabletPercentage').textContent = '5%';
    }

    updateInsights() {
        const insights = this.generateInsights();
        const insightsGrid = document.getElementById('insightsGrid');
        
        insightsGrid.innerHTML = insights.map(insight => `
            <div class="insight-card">
                <div class="insight-header">
                    <div class="insight-icon">
                        <i class="${insight.icon}"></i>
                    </div>
                    <h4 class="insight-title">${insight.title}</h4>
                </div>
                <div class="insight-content">
                    ${insight.content}
                </div>
            </div>
        `).join('');
    }

    generateInsights() {
        const metrics = this.calculateMetrics();
        const insights = [];
        
        // Revenue insight
        if (metrics.totalRevenue > 0) {
            insights.push({
                icon: 'fas fa-chart-line',
                title: 'Revenue Performance',
                content: `Your total revenue is <span class="insight-value">Rs ${metrics.totalRevenue.toLocaleString()}</span> with a conversion rate of <span class="insight-value">${metrics.conversionRate.toFixed(1)}%</span>.`
            });
        }
        
        // User growth insight
        if (metrics.totalUsers > 0) {
            insights.push({
                icon: 'fas fa-users',
                title: 'User Growth',
                content: `You have <span class="insight-value">${metrics.totalUsers.toLocaleString()}</span> total users with <span class="insight-value">${metrics.totalOrders}</span> completed orders.`
            });
        }
        
        // Product performance insight
        const topProducts = this.calculateTopProducts();
        if (topProducts.labels.length > 0) {
            insights.push({
                icon: 'fas fa-star',
                title: 'Top Product',
                content: `<span class="insight-value">${topProducts.labels[0]}</span> is your best-selling product with <span class="insight-value">${topProducts.values[0]}</span> units sold.`
            });
        }
        
        // Category insight
        const categoryData = this.calculateSalesByCategory();
        if (categoryData.labels.length > 0) {
            insights.push({
                icon: 'fas fa-tags',
                title: 'Category Leader',
                content: `<span class="insight-value">${categoryData.labels[0]}</span> category generates the most revenue at <span class="insight-value">Rs ${categoryData.values[0].toLocaleString()}</span>.`
            });
        }
        
        return insights;
    }

    async applyDateRange() {
        const startDate = new Date(document.getElementById('startDate').value);
        const endDate = new Date(document.getElementById('endDate').value);
        
        if (startDate > endDate) {
            this.showError('Start date cannot be after end date');
            return;
        }
        
        this.dateRange.start = startDate;
        this.dateRange.end = endDate;
        
        // Reload data with new date range
        await this.loadAllData();
        this.updateDashboard();
        this.updateAllCharts();
        this.showSuccess('Date range applied successfully');
    }

    resetDateRange() {
        this.setDefaultDateRange();
        this.updateDashboard();
        this.updateAllCharts();
    }

    updateAllCharts() {
        this.updateRevenueChart(30);
        this.updateCategoryChart();
        this.updateUserGrowthChart();
        this.updateTopProductsChart();
    }

    async refreshData() {
        try {
            this.showLoading();
            await this.loadAllData();
            this.updateDashboard();
            this.updateAllCharts();
            this.showSuccess('Data refreshed successfully');
        } catch (error) {
            console.error('Error refreshing data:', error);
            this.showError('Failed to refresh data');
        }
    }

    exportReport() {
        try {
            const reportData = {
                dateRange: this.dateRange,
                metrics: this.calculateMetrics(),
                sales: this.data.payments.filter(p => p.status === 'completed'),
                users: this.data.users,
                generatedAt: new Date().toISOString()
            };
            
            const dataStr = JSON.stringify(reportData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = `analytics-report-${this.formatDate(new Date())}.json`;
            link.click();
            
            this.showSuccess('Report exported successfully');
        } catch (error) {
            console.error('Error exporting report:', error);
            this.showError('Failed to export report');
        }
    }

    formatDate(date) {
        return date.toISOString().split('T')[0];
    }

    formatCategoryName(category) {
        return category.split('-').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }

    showLoading() {
        // Show loading state
        const loadingElements = document.querySelectorAll('.chart-container, .analytics-card');
        loadingElements.forEach(element => {
            element.style.opacity = '0.6';
        });
    }

    showError(message) {
        // Show error message
        console.error(message);
        // You could implement a toast notification here
    }

    showSuccess(message) {
        // Show success message
        console.log(message);
        // You could implement a toast notification here
    }
}

// Initialize analytics dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Wait for Firebase to be available
    if (window.db && window.auth) {
        new AnalyticsDashboard();
    } else {
        // Retry after a short delay
        setTimeout(() => {
            if (window.db && window.auth) {
                new AnalyticsDashboard();
            } else {
                console.error('Firebase not available');
            }
        }, 1000);
    }
});

// Global functions for external access
window.AnalyticsDashboard = AnalyticsDashboard;
