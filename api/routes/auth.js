const { Router } = require('express')
const ms = require('ms')
const dbApi = require('../db-api')
const jwt = require('../jwt')
const { sendEmail } = require('../notifier')
const createUrl = require('../create-url')

const app = Router()

module.exports = app

const SESSION_DURATION = ms('20d')
const LOGIN_TIMEOUT = ms('12hrs')

function sendTokenEmail (email, token) {
  const uri = createUrl(`/api/auth/${token}`)

  return sendEmail({
    to: email,
    subject: 'Login a Hecha la Ley',
    html: `
      <p>Para entrar haz click en el link:</p>
      <p><a href="${uri}">${uri}</a></p>
      <p><sub>Fecha de creación: ${(new Date()).toString()}</sub></p>
    `
  })
}

function sendToken (email) {
  const payload = { email }
  return jwt.create(payload, LOGIN_TIMEOUT).then((token) => (
    sendTokenEmail(email, token)
  ))
}

function setCookie (res, name, payload, duration = 0) {
  return res.cookie(name, payload, {
    maxAge: duration,
    sameSite: true,
    httpOnly: true
  })
}

function setToken (res, email) {
  return jwt.create({ email }, SESSION_DURATION).then((token) => {
    setCookie(res, 'sessionToken', token, SESSION_DURATION)
  })
}

app.post('/auth/login', async (req, res) => {
  const { email } = req.body

  if (!email) return res.sendStatus(400)

  try {
    const user = await dbApi.users.findByEmail(email)

    if (!user) {
      const isEmpty = await dbApi.users.isEmptyCached()

      if (isEmpty) {
        await dbApi.users.create({ email })
      } else {
        throw new Error('email not found.')
      }
    }

    await sendToken(email)

    res.status(200).json({ code: 'TOKEN_SENDED' })
  } catch (err) {
    res.sendStatus(403)
  }
})

app.get('/auth/logout', (req, res) => {
  res.clearCookie('sessionToken')
  res.redirect('/admin')
})

app.get('/auth/:token', (req, res) => {
  const { token } = req.params

  jwt.verify(token)
    .then(({ email }) => setToken(res, email))
    .then(() => res.redirect('/admin'))
    .catch(() => res.sendStatus(403))
})