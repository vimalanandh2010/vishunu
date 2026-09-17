import './style.css'
import logo1 from './assets/logo1.png'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

document.querySelector('#app').innerHTML = `
  <div class="signup-container">
    <div class="signup-box">
      <div class="logo-container">
        <img src="${logo1}" class="logo" alt="vlove logo" />
        <h1>vlove</h1>
      </div>
      
      <h2>Create your account</h2>
      
      <button type="button" class="google-login-btn">
        <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
          <path d="M9.003 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.96v2.332C2.44 15.983 5.485 18 9.003 18z" fill="#34A853"/>
          <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9.001c0 1.452.348 2.827.957 4.041l3.007-2.332z" fill="#FBBC05"/>
          <path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.426 0 9.003 0 5.485 0 2.44 2.017.96 4.958L3.967 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </button>
      
      <div class="divider">
        <span>OR</span>
      </div>
      
      <form class="signup-form">
        <div class="form-group">
          <label for="name">Full Name</label>
          <input type="text" id="name" name="name" placeholder="Enter your full name" required />
        </div>
        
        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" placeholder="Enter your email" required />
        </div>
        
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" placeholder="Create a password" required />
        </div>
        
        <div class="form-group">
          <label for="confirm-password">Confirm Password</label>
          <input type="password" id="confirm-password" name="confirm-password" placeholder="Confirm your password" required />
        </div>
        
        <button type="submit" class="signup-button">Sign Up</button>
      </form>
      
      <p class="login-link">
        Already have an account? <a href="#">Log in</a>
      </p>
    </div>
  </div>
`

// Handle Google login - Connect to backend
document.querySelector('.google-login-btn').addEventListener('click', () => {
  console.log('Redirecting to Google OAuth...')
  // Redirect to backend Google OAuth endpoint
  window.location.href = `${API_URL}/auth/google`;
})

// Handle form submission - Connect to backend
document.querySelector('.signup-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const formData = new FormData(e.target)
  const data = Object.fromEntries(formData)
  
  // Validate passwords match
  if (data.password !== data['confirm-password']) {
    alert('Passwords do not match!')
    return
  }
  
  try {
    // Send signup data to backend
    const response = await fetch(`${API_URL}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: data.name,
        email: data.email,
        password: data.password
      }),
      credentials: 'include'
    })
    
    const result = await response.json()
    
    if (response.ok) {
      console.log('Signup successful:', result)
      alert('Signup successful! Welcome to vlove!')
      // Redirect to dashboard or home page
      // window.location.href = '/dashboard'
    } else {
      console.error('Signup failed:', result)
      alert(result.error || 'Signup failed. Please try again.')
    }
  } catch (error) {
    console.error('Error during signup:', error)
    alert('Network error. Please check if the server is running.')
  }
})

// Check authentication status on page load
async function checkAuthStatus() {
  try {
    const response = await fetch(`${API_URL}/auth/status`, {
      credentials: 'include'
    })
    const data = await response.json()
    
    if (data.authenticated) {
      console.log('User is authenticated:', data.user)
      // Optionally redirect authenticated users
      // window.location.href = '/dashboard'
    }
  } catch (error) {
    console.error('Error checking auth status:', error)
  }
}

// Check if user came back from Google OAuth
const urlParams = new URLSearchParams(window.location.search)
if (urlParams.get('auth') === 'success') {
  console.log('Google OAuth successful!')
  alert('Welcome! You have successfully logged in with Google.')
  checkAuthStatus()
}

checkAuthStatus()
