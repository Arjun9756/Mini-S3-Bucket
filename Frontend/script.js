// Global variables
let currentUser = null;
let userToken = null;
let apiKey = null;
let apiSecret = null;
let currentFiles = [];
let currentFileForAction = null;
let analysisRefreshInterval = null;
let isLoadingAnalysis = false;
let isLoadingFiles = false;

// API Base URL - Update this with your Render backend URL
const API_BASE = 'http://localhost:3000/api/';

// Utility function for API requests with timeout and rate limit handling
async function apiRequest(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // Increased to 30 seconds
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        // Handle rate limiting
        if (response.status === 429) {
            throw new Error('RATE_LIMIT');
        }
        
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Request timeout - server might be slow');
        }
        throw error;
    }
}

// Performance monitoring
let requestCount = 0;
let lastRequestTime = Date.now();

function logRequest(type) {
    requestCount++;
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    lastRequestTime = now;
    
    console.log(`[${new Date().toLocaleTimeString()}] ${type} request #${requestCount} (${timeSinceLastRequest}ms since last)`);
}

// DOM Elements
const authContainer = document.getElementById('authContainer');
const dashboardContainer = document.getElementById('dashboardContainer');
const loadingOverlay = document.getElementById('loadingOverlay');
const toastContainer = document.getElementById('toastContainer');

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
});

// Initialize application
function initializeApp() {
    // Check if user is already logged in
    const savedToken = localStorage.getItem('userToken');
    const savedUser = localStorage.getItem('currentUser');
    
    if (savedToken && savedUser) {
        userToken = savedToken;
        currentUser = JSON.parse(savedUser);
        showDashboard();
        loadFiles();
        loadAnalysisData();
        
        // Start analysis auto-refresh with longer interval (30 seconds instead of 10)
        startAnalysisRefresh();
    } else {
        showAuth();
    }
}

// Start analysis refresh with optimized timing
function startAnalysisRefresh() {
    // Clear any existing interval
    if (analysisRefreshInterval) {
        clearInterval(analysisRefreshInterval);
    }
    
    // Auto-refresh analysis data every 60 seconds (reduced from 30)
    analysisRefreshInterval = setInterval(() => {
        if (userToken && currentUser && !isLoadingAnalysis) {
            loadAnalysisData();
        }
    }, 60000); // 60 seconds instead of 30
}

// Stop analysis refresh
function stopAnalysisRefresh() {
    if (analysisRefreshInterval) {
        clearInterval(analysisRefreshInterval);
        analysisRefreshInterval = null;
    }
}

// Setup event listeners
function setupEventListeners() {
    // Auth forms
    document.getElementById('loginFormElement').addEventListener('submit', handleLogin);
    document.getElementById('registerFormElement').addEventListener('submit', handleRegister);
    
    // File upload
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');
    
    fileInput.addEventListener('change', handleFileSelect);
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleFileDrop);
    
    // Header buttons
    document.getElementById('showApiBtn').addEventListener('click', showApiModal);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // File modal actions
    document.getElementById('downloadBtn').addEventListener('click', handleDownload);
    document.getElementById('shareBtn').addEventListener('click', showShareSection);
    document.getElementById('deleteBtn').addEventListener('click', handleDelete);
    document.getElementById('shareSubmitBtn').addEventListener('click', handleShare);
}

// Show/Hide functions
function showAuth() {
    authContainer.style.display = 'flex';
    dashboardContainer.classList.remove('active');
}

function showDashboard() {
    authContainer.style.display = 'none';
    dashboardContainer.classList.add('active');
    
    if (currentUser) {
        document.getElementById('userWelcome').textContent = `Welcome back, ${currentUser.name}`;
        
        if (currentUser.api_key) {
            apiKey = currentUser.api_key;
            apiSecret = currentUser.api_secret_hash;
        }
    }
}

function showLoading(show = true) {
    if (show) {
        loadingOverlay.classList.add('show');
    } else {
        loadingOverlay.classList.remove('show');
    }
}

// Toast notifications
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'fas fa-info-circle';
    if (type === 'success') icon = 'fas fa-check-circle';
    if (type === 'error') icon = 'fas fa-exclamation-circle';
    if (type === 'warning') icon = 'fas fa-exclamation-triangle';
    
    toast.innerHTML = `
        <i class="${icon}"></i>
        <span>${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 5000);
}

// Auth functions
function switchToRegister() {
    document.getElementById('loginForm').classList.remove('active');
    document.getElementById('registerForm').classList.add('active');
}

function switchToLogin() {
    document.getElementById('registerForm').classList.remove('active');
    document.getElementById('loginForm').classList.add('active');
}

function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const button = input.nextElementSibling;
    const icon = button.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

// Handle login
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await apiRequest(`${API_BASE}user/login/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.status) {
            currentUser = {
                userId: data.userId,
                name: data.name,
                email: email,
                api_key: data.api_key,
                api_secret_hash: data.api_secret_hash,
                permission: data.permission
            };
            userToken = data.token;
            
            // Save to localStorage
            localStorage.setItem('userToken', userToken);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            showToast('Login successful!', 'success');
            showDashboard();
            loadFiles();
            loadAnalysisData();
            
            // Start analysis refresh
            startAnalysisRefresh();
        } else {
            showToast(data.message || 'Login failed', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        
        if (error.message === 'RATE_LIMIT') {
            showToast('Rate limit exceeded! Please wait and try again.', 'warning');
        } else {
            showToast('Network error. Please try again. - ' + error.message, 'error');
        }
    } finally {
        showLoading(false);
    }
}

// Handle registration
async function handleRegister(e) {
    e.preventDefault();
    
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    
    if (!name || !email || !password) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    if (password.length < 4) {
        showToast('Password must be at least 4 characters', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await apiRequest(`${API_BASE}user/register/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('Registration successful! Please login.', 'success');
            switchToLogin();
            
            // Pre-fill login form
            document.getElementById('loginEmail').value = email;
        } else {
            showToast(data.message || 'Registration failed', 'error');
        }
    } catch (error) {
        console.error('Registration error:', error);
        
        if (error.message === 'RATE_LIMIT') {
            showToast('Rate limit exceeded! Please wait and try again.', 'warning');
        } else {
            showToast('Network error. Please try again. - ' + error.message, 'error');
        }
    } finally {
        showLoading(false);
    }
}

// Handle logout
function handleLogout() {
    // Stop analysis refresh
    stopAnalysisRefresh();
    
    currentUser = null;
    userToken = null;
    apiKey = null;
    apiSecret = null;
    currentFiles = [];
    
    localStorage.removeItem('userToken');
    localStorage.removeItem('currentUser');
    
    showToast('Logged out successfully', 'success');
    showAuth();
}

// File upload functions
function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
}

function handleFileDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    
    const files = Array.from(e.dataTransfer.files);
    uploadFiles(files);
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    uploadFiles(files);
}

// Upload files
async function uploadFiles(files) {
    if (!files.length) return;
    
    const uploadProgress = document.getElementById('uploadProgress');
    const progressFill = uploadProgress.querySelector('.progress-fill');
    const progressText = uploadProgress.querySelector('.progress-text');
    
    uploadProgress.classList.remove('hidden');
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const progress = ((i + 1) / files.length) * 100;
        
        progressFill.style.width = `${progress}%`;
        progressText.textContent = `Uploading ${file.name}...`;
        
        try {
            await uploadSingleFile(file);
            showToast(`${file.name} uploaded successfully!`, 'success');
        } catch (error) {
            console.error('Upload error:', error);
            showToast(`Failed to upload ${file.name}`, 'error');
        }
    }
    
    uploadProgress.classList.add('hidden');
    progressFill.style.width = '0%';
    
    // Reload files and start analysis with delay
    loadFiles();
    
    // Wait 7-10 seconds then check for analysis (reduced frequency)
    setTimeout(() => {
        loadAnalysisData();
    }, 8000);
}

// Upload single file
async function uploadSingleFile(file) {
    // Step 1: Generate signed URL
    const signedUrlResponse = await fetch(`${API_BASE}file/generate-sign-url/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({
            fileName: file.name,
            operation: 'upload',
            api_key: currentUser.api_key
        })
    });
    
    const signedUrlData = await signedUrlResponse.json();
    
    if (!signedUrlData.status) {
        throw new Error(signedUrlData.message || 'Failed to generate signed URL');
    }
    
    // Step 2: Upload file using signed URL
    const formData = new FormData();
    formData.append('file', file);
    
    const uploadResponse = await fetch(signedUrlData.signedURL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${userToken}`
        },
        body: formData
    });
    
    const uploadData = await uploadResponse.json();
    
    if (!uploadData.status) {
        throw new Error(uploadData.message || 'Failed to upload file');
    }
    
    return uploadData;
}

// Load files
async function loadFiles() {
    if (isLoadingFiles) return; // Prevent multiple simultaneous requests
    
    const filesContainer = document.getElementById('filesContainer');
    isLoadingFiles = true;
    
    try {
        const response = await apiRequest(`${API_BASE}file/getFiles/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.status && data.data) {
            currentFiles = data.data;
            renderFiles(currentFiles);
        } else {
            filesContainer.innerHTML = `
                <div class="loading-files">
                    <i class="fas fa-folder-open"></i>
                    <p>No files found</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Load files error:', error);
        filesContainer.innerHTML = `
            <div class="loading-files">
                <i class="fas fa-exclamation-circle"></i>
                <p>Error loading files</p>
            </div>
        `;
    } finally {
        isLoadingFiles = false;
    }
}

// Render files
function renderFiles(files) {
    const filesContainer = document.getElementById('filesContainer');
    
    if (!files.length) {
        filesContainer.innerHTML = `
            <div class="loading-files">
                <i class="fas fa-folder-open"></i>
                <p>No files uploaded yet</p>
            </div>
        `;
        return;
    }
    
    const filesHtml = files.map(file => {
        const fileSize = formatFileSize(file.size);
        const uploadDate = new Date(parseInt(file.createdAt)).toLocaleDateString();
        const fileIcon = getFileIcon(file.mime_type);
        
        // Determine file ownership and sharing status
        const isOwner = file.file_type === 'owned';
        const isShared = file.file_type === 'shared';
        
        // Create ownership/sharing labels
        let ownershipLabel = '';
        if (isOwner) {
            ownershipLabel = `<span class="file-owner-label"><i class="fas fa-crown"></i> Your File</span>`;
        } else if (isShared) {
            ownershipLabel = `<span class="file-shared-label"><i class="fas fa-share"></i> Shared by ${file.owner_name}</span>`;
        }
        
        // Create action buttons based on ownership
        let actionButtons = '';
        if (isOwner) {
            // Owner can download, share, and delete
            actionButtons = `
                <button class="action-btn download" onclick="quickDownload('${file.id}')" title="Download">
                    <i class="fas fa-download"></i>
                </button>
                <button class="action-btn share" onclick="openFileModal('${file.id}')" title="Share">
                    <i class="fas fa-share"></i>
                </button>
                <button class="action-btn delete" onclick="quickDelete('${file.id}')" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        } else if (isShared) {
            // Shared user can only download
            actionButtons = `
                <button class="action-btn download" onclick="quickDownload('${file.id}')" title="Download">
                    <i class="fas fa-download"></i>
                </button>
                <span class="shared-file-note">
                    <i class="fas fa-info-circle"></i> Shared file - Limited actions
                </span>
            `;
        }
        
        return `
            <div class="file-item ${isShared ? 'shared-file' : 'owned-file'}" onclick="openFileModal('${file.id}')">
                <div class="file-icon">
                    <i class="${fileIcon}"></i>
                </div>
                <div class="file-info">
                    <div class="file-name">${file.original_name}</div>
                    <div class="file-details">
                        ${fileSize} • ${uploadDate} • ${file.mime_type}
                        ${ownershipLabel}
                    </div>
                </div>
                <div class="file-actions" onclick="event.stopPropagation()">
                    ${actionButtons}
                </div>
            </div>
        `;
    }).join('');
    
    filesContainer.innerHTML = filesHtml;
}

// Get file icon based on mime type
function getFileIcon(mimeType) {
    if (mimeType.startsWith('image/')) return 'fas fa-image';
    if (mimeType.startsWith('video/')) return 'fas fa-video';
    if (mimeType.startsWith('audio/')) return 'fas fa-music';
    if (mimeType.includes('pdf')) return 'fas fa-file-pdf';
    if (mimeType.includes('word')) return 'fas fa-file-word';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'fas fa-file-excel';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'fas fa-file-powerpoint';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return 'fas fa-file-archive';
    return 'fas fa-file';
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Open file modal
function openFileModal(fileId) {
    const file = currentFiles.find(f => f.id === fileId);
    if (!file) return;
    
    currentFileForAction = file;
    
    const isOwner = file.file_type === 'owned';
    const isShared = file.file_type === 'shared';
    
    document.getElementById('fileModalTitle').textContent = file.original_name;
    
    // Update modal content based on ownership
    const modalBody = document.querySelector('#fileModal .modal-body');
    
    if (isOwner) {
        // Owner modal - can share, download, delete, and revoke shares
        modalBody.innerHTML = `
            <div class="file-ownership-info">
                <span class="owner-badge"><i class="fas fa-crown"></i> Your File</span>
            </div>
            <div class="file-actions">
                <button id="downloadBtn" class="action-btn download">
                    <i class="fas fa-download"></i> Download
                </button>
                <button id="shareBtn" class="action-btn share">
                    <i class="fas fa-share"></i> Share
                </button>
                <button id="deleteBtn" class="action-btn delete">
                    <i class="fas fa-trash"></i> Delete
                </button>
                <button id="manageSharesBtn" class="action-btn manage" onclick="showManageShares()">
                    <i class="fas fa-users-cog"></i> Manage Shares
                </button>
            </div>
            <div id="shareSection" class="share-section hidden">
                <h4>Share with Email</h4>
                <div class="input-group">
                    <input type="email" id="shareEmail" placeholder="Enter email address">
                    <button id="shareSubmitBtn" class="share-submit-btn">Share</button>
                </div>
                <div id="shareResult" class="share-result hidden"></div>
            </div>
            <div id="manageSharesSection" class="manage-shares-section hidden">
                <h4>Currently Shared With</h4>
                <div id="sharedUsersList" class="shared-users-list">
                    <div class="loading-shares">Loading shared users...</div>
                </div>
            </div>
        `;
    } else if (isShared) {
        // Shared file modal - limited options
        modalBody.innerHTML = `
            <div class="file-ownership-info">
                <span class="shared-badge"><i class="fas fa-share"></i> Shared by ${file.owner_name}</span>
                <small>Owner: ${file.owner_email}</small>
            </div>
            <div class="file-actions">
                <button id="downloadBtn" class="action-btn download">
                    <i class="fas fa-download"></i> Download
                </button>
            </div>
            <div class="shared-file-notice">
                <i class="fas fa-info-circle"></i>
                <p>This file was shared with you. You can download it but cannot share or delete it.</p>
            </div>
        `;
    }
    
    document.getElementById('fileModal').classList.add('show');
    
    // Re-attach event listeners
    const downloadBtn = document.getElementById('downloadBtn');
    const shareBtn = document.getElementById('shareBtn');
    const deleteBtn = document.getElementById('deleteBtn');
    const shareSubmitBtn = document.getElementById('shareSubmitBtn');
    
    if (downloadBtn) downloadBtn.addEventListener('click', handleDownload);
    if (shareBtn) shareBtn.addEventListener('click', showShareSection);
    if (deleteBtn) deleteBtn.addEventListener('click', handleDelete);
    if (shareSubmitBtn) shareSubmitBtn.addEventListener('click', handleShare);
}

// Close file modal
function closeFileModal() {
    document.getElementById('fileModal').classList.remove('show');
    currentFileForAction = null;
}

// Handle download
async function handleDownload() {
    if (!currentFileForAction) return;
    
    try {
        const response = await apiRequest(`${API_BASE}file/download/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({
                storagePath: currentFileForAction.storage_path,
                origialName: currentFileForAction.original_name,
                id: currentFileForAction.id
            })
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = currentFileForAction.original_name;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            showToast('Download started!', 'success');
            closeFileModal();
        } else {
            showToast('Download failed', 'error');
        }
    } catch (error) {
        console.error('Download error:', error);
        if (error.message === 'RATE_LIMIT') {
            showToast('Rate limit exceeded! Please wait and try again.', 'warning');
        } else {
            showToast('Download failed - ' + error.message, 'error');
        }
    }
}

// Show share section
function showShareSection() {
    document.getElementById('shareSection').classList.remove('hidden');
}

// Handle share
async function handleShare() {
    if (!currentFileForAction) return;
    
    const email = document.getElementById('shareEmail').value;
    if (!email) {
        showToast('Please enter an email address', 'error');
        return;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showToast('Please enter a valid email address', 'error');
        return;
    }
    
    const shareBtn = document.getElementById('shareSubmitBtn');
    const originalText = shareBtn.textContent;
    shareBtn.textContent = 'Sharing...';
    shareBtn.disabled = true;
    
    try {
        // Fix the storage path by escaping backslashes
        const fixedStoragePath = currentFileForAction.storage_path.replace(/\\/g, '\\\\');
        
        const response = await apiRequest(`${API_BASE}file/shareWith/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({
                emailToShareWith: email,
                fileID: currentFileForAction.id,
                filePath: fixedStoragePath
            })
        });
        
        const data = await response.json();
        
        const shareResult = document.getElementById('shareResult');
        shareResult.classList.remove('hidden');
        
        if (response.ok && data.status) {
            shareResult.className = 'share-result success';
            shareResult.innerHTML = `
                <strong>File shared successfully!</strong><br>
                <small>Shared with: ${email}</small><br>
                <div style="margin-top: 10px;">
                    <strong>Shareable URL:</strong><br>
                    <input type="text" value="${data.shareableURL}" readonly style="width: 100%; padding: 5px; margin-top: 5px; font-size: 12px;">
                    <button onclick="copyShareUrl('${data.shareableURL}')" style="margin-top: 5px; padding: 5px 10px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        <i class="fas fa-copy"></i> Copy URL
                    </button>
                </div>
            `;
            showToast('File shared successfully!', 'success');
            
            // Clear email input
            document.getElementById('shareEmail').value = '';
        } else {
            shareResult.className = 'share-result error';
            shareResult.innerHTML = `
                <strong>Failed to share file</strong><br>
                <small>${data.message || 'Unknown error occurred'}</small>
            `;
            showToast(data.message || 'Failed to share file', 'error');
        }
    } catch (error) {
        console.error('Share error:', error);
        
        const shareResult = document.getElementById('shareResult');
        shareResult.classList.remove('hidden');
        
        if (error.message === 'RATE_LIMIT') {
            shareResult.className = 'share-result error';
            shareResult.innerHTML = `
                <strong>Rate limit exceeded!</strong><br>
                <small>Too many requests. Please wait a moment and try again.</small>
            `;
            showToast('Rate limit exceeded! Please wait and try again.', 'warning');
        } else {
            shareResult.className = 'share-result error';
            shareResult.innerHTML = `
                <strong>Network error</strong><br>
                <small>${error.message}</small>
            `;
            showToast('Failed to share file - ' + error.message, 'error');
        }
    } finally {
        shareBtn.textContent = originalText;
        shareBtn.disabled = false;
    }
}

// Handle delete
async function handleDelete() {
    if (!currentFileForAction) return;
    
    if (!confirm(`Are you sure you want to delete "${currentFileForAction.original_name}"?`)) {
        return;
    }
    
    try {
        const response = await apiRequest(`${API_BASE}file/delete/`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({
                id: currentFileForAction.id,
                storagePath: currentFileForAction.storage_path
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.status) {
            showToast('File deleted successfully!', 'success');
            closeFileModal();
            loadFiles();
            loadAnalysisData();
        } else {
            showToast(data.message || 'Failed to delete file', 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        if (error.message === 'RATE_LIMIT') {
            showToast('Rate limit exceeded! Please wait and try again.', 'warning');
        } else {
            showToast('Failed to delete file - ' + error.message, 'error');
        }
    }
}

// Load analysis data
async function loadAnalysisData() {
    if (isLoadingAnalysis) return; // Prevent multiple simultaneous requests
    
    const analysisContainer = document.getElementById('analysisContainer');
    isLoadingAnalysis = true;
    
    // Add a subtle loading indicator only if container is not empty
    let refreshIndicator = null;
    if (analysisContainer.children.length > 0 && !analysisContainer.querySelector('.analysis-placeholder')) {
        refreshIndicator = document.createElement('div');
        refreshIndicator.className = 'refresh-indicator';
        refreshIndicator.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i>';
        refreshIndicator.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            color: #667eea;
            font-size: 14px;
            z-index: 10;
        `;
        
        if (analysisContainer.style.position !== 'relative') {
            analysisContainer.style.position = 'relative';
        }
        
        analysisContainer.appendChild(refreshIndicator);
    }
    
    try {
        logRequest('Analysis Data');
        const response = await apiRequest(`${API_BASE}report/analysisData/`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });
        
        const data = await response.json();
        
        // Remove refresh indicator
        if (refreshIndicator && refreshIndicator.parentNode) {
            refreshIndicator.parentNode.removeChild(refreshIndicator);
        }
        
        if (data.status && data.rows && data.rows.length > 0) {
            renderAnalysisData(data.rows);
            // Update last updated time
            const lastUpdated = document.getElementById('lastUpdated');
            if (lastUpdated) {
                lastUpdated.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
            }
        } else {
            analysisContainer.innerHTML = `
                <div class="analysis-placeholder">
                    <i class="fas fa-search"></i>
                    <p>No analysis data available</p>
                    <small>Files are automatically scanned after upload</small>
                </div>
            `;
        }
    } catch (error) {
        console.error('Load analysis error:', error);
        
        // Remove refresh indicator
        if (refreshIndicator && refreshIndicator.parentNode) {
            refreshIndicator.parentNode.removeChild(refreshIndicator);
        }
        
        analysisContainer.innerHTML = `
            <div class="analysis-placeholder">
                <i class="fas fa-exclamation-circle"></i>
                <p>Error loading analysis data</p>
                <small>Will retry automatically</small>
            </div>
        `;
    } finally {
        isLoadingAnalysis = false;
    }
}

// Render analysis data
function renderAnalysisData(analysisData) {
    const analysisContainer = document.getElementById('analysisContainer');
    
    const analysisHtml = analysisData.map(analysis => {
        const file = currentFiles.find(f => f.id === analysis.file_id);
        const fileName = file ? file.original_name : 'Unknown File';
        const scanDate = new Date(parseInt(analysis.date_scan) * 1000).toLocaleDateString();
        
        const statusClass = analysis.status === 'safe' ? 'safe' : 'dangerous';
        const statusIcon = analysis.status === 'safe' ? 'fas fa-shield-alt' : 'fas fa-exclamation-triangle';
        
        // Calculate total scans
        const stats = analysis.stats;
        const totalScans = stats.malicious + stats.suspicious + stats.harmless + stats.undetected;
        
        return `
            <div class="analysis-item">
                <div class="analysis-status ${statusClass}">
                    <i class="${statusIcon}"></i>
                </div>
                <div class="analysis-details">
                    <h4>${fileName}</h4>
                    <p>Scanned on ${scanDate} • Status: <strong>${analysis.status.toUpperCase()}</strong></p>
                    <p>Total Scans: ${totalScans} engines</p>
                    <div class="analysis-stats">
                        <div class="stat-item ${stats.malicious > 0 ? 'danger' : ''}">
                            <div class="stat-value">${stats.malicious}</div>
                            <div class="stat-label">Malicious</div>
                        </div>
                        <div class="stat-item ${stats.suspicious > 0 ? 'warning' : ''}">
                            <div class="stat-value">${stats.suspicious}</div>
                            <div class="stat-label">Suspicious</div>
                        </div>
                        <div class="stat-item ${stats.harmless > 0 ? 'success' : ''}">
                            <div class="stat-value">${stats.harmless}</div>
                            <div class="stat-label">Harmless</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${stats.undetected}</div>
                            <div class="stat-label">Undetected</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    analysisContainer.innerHTML = analysisHtml;
}

// API Modal functions
function showApiModal() {
    if (currentUser && currentUser.api_key) {
        document.getElementById('apiKeyDisplay').value = currentUser.api_key;
        document.getElementById('apiSecretDisplay').value = currentUser.api_secret_hash;
        document.getElementById('apiModal').classList.add('show');
    }
}

function closeApiModal() {
    document.getElementById('apiModal').classList.remove('show');
}

function toggleApiSecret() {
    const input = document.getElementById('apiSecretDisplay');
    const button = input.nextElementSibling;
    const icon = button.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

function copyToClipboard(inputId) {
    const input = document.getElementById(inputId);
    input.select();
    document.execCommand('copy');
    showToast('Copied to clipboard!', 'success');
}

// Show manage shares section
function showManageShares() {
    const manageSection = document.getElementById('manageSharesSection');
    manageSection.classList.remove('hidden');
    
    // Load current shares for this file
    loadFileShares(currentFileForAction.id);
}

// Load file shares
async function loadFileShares(fileId) {
    const sharedUsersList = document.getElementById('sharedUsersList');
    
    try {
        const response = await apiRequest(`${API_BASE}file/${fileId}/`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.status && data.rows && data.rows.length > 0) {
            const fileData = data.rows[0];
            let sharedWith = [];
            
            try {
                if (typeof fileData.shared_with === 'string') {
                    sharedWith = JSON.parse(fileData.shared_with);
                } else if (Array.isArray(fileData.shared_with)) {
                    sharedWith = fileData.shared_with;
                }
            } catch (e) {
                sharedWith = [];
            }
            
            if (sharedWith.length === 0) {
                sharedUsersList.innerHTML = `
                    <div class="no-shares">
                        <i class="fas fa-users-slash"></i>
                        <p>File not shared with anyone yet</p>
                    </div>
                `;
                return;
            }
            
            const sharesHtml = sharedWith.map(share => `
                <div class="shared-user-item">
                    <div class="shared-user-info">
                        <i class="fas fa-user"></i>
                        <span class="shared-email">${share.shareWithEmail}</span>
                    </div>
                    <button class="revoke-btn" onclick="revokeShare('${share.shareWithEmail}', '${share.shareWithID}')" title="Revoke Access">
                        <i class="fas fa-times"></i> Revoke
                    </button>
                </div>
            `).join('');
            
            sharedUsersList.innerHTML = sharesHtml;
        }
    } catch (error) {
        console.error('Error loading file shares:', error);
        sharedUsersList.innerHTML = `
            <div class="error-shares">
                <i class="fas fa-exclamation-circle"></i>
                <p>Error loading shared users</p>
            </div>
        `;
    }
}

// Revoke share
async function revokeShare(sharedWithEmail, sharedWithId) {
    if (!confirm(`Are you sure you want to revoke access for ${sharedWithEmail}?`)) {
        return;
    }
    
    try {
        showLoading(true);
        const response = await apiRequest(`${API_BASE}file/removeShare/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({
                sharedWithEmail: sharedWithEmail,
                sharedWithId: sharedWithId
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.status) {
            showToast(`Access revoked for ${sharedWithEmail}`, 'success');
            // Reload the shares list
            loadFileShares(currentFileForAction.id);
        } else {
            showToast(data.message || 'Failed to revoke access', 'error');
        }
    } catch (error) {
        console.error('Revoke error:', error);
        if (error.message === 'RATE_LIMIT') {
            showToast('Rate limit exceeded! Please wait and try again.', 'warning');
        } else {
            showToast('Failed to revoke access - ' + error.message, 'error');
        }
    } finally {
        showLoading(false);
    }
}
function copyShareUrl(url) {
    navigator.clipboard.writeText(url).then(() => {
        showToast('Share URL copied to clipboard!', 'success');
    }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast('Share URL copied to clipboard!', 'success');
    });
}
window.addEventListener('click', function(e) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });
});

// Manual refresh analysis
function manualRefreshAnalysis() {
    const btn = document.getElementById('refreshAnalysisBtn');
    const icon = btn.querySelector('i');
    
    // Add spinning animation
    icon.classList.add('fa-spin');
    btn.disabled = true;
    
    loadAnalysisData().finally(() => {
        // Remove spinning animation
        icon.classList.remove('fa-spin');
        btn.disabled = false;
    });
}

// Quick action functions for file items
async function quickDownload(fileId) {
    const file = currentFiles.find(f => f.id === fileId);
    if (!file) return;
    
    try {
        showLoading(true);
        const response = await apiRequest(`${API_BASE}file/download/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({
                storagePath: file.storage_path,
                origialName: file.original_name,
                id: file.id
            })
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.original_name;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            showToast('Download started!', 'success');
        } else {
            showToast('Download failed', 'error');
        }
    } catch (error) {
        console.error('Download error:', error);
        if (error.message === 'RATE_LIMIT') {
            showToast('Rate limit exceeded! Please wait and try again.', 'warning');
        } else {
            showToast('Download failed - ' + error.message, 'error');
        }
    } finally {
        showLoading(false);
    }
}

async function quickDelete(fileId) {
    const file = currentFiles.find(f => f.id === fileId);
    if (!file) return;
    
    if (!confirm(`Are you sure you want to delete "${file.original_name}"?`)) {
        return;
    }
    
    try {
        showLoading(true);
        const response = await apiRequest(`${API_BASE}file/delete/`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({
                id: file.id,
                storagePath: file.storage_path
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.status) {
            showToast('File deleted successfully!', 'success');
            loadFiles();
            loadAnalysisData();
        } else {
            showToast(data.message || 'Failed to delete file', 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        if (error.message === 'RATE_LIMIT') {
            showToast('Rate limit exceeded! Please wait and try again.', 'warning');
        } else {
            showToast('Failed to delete file - ' + error.message, 'error');
        }
    } finally {
        showLoading(false);
    }
}