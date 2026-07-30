import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Mail, Phone, MapPin, Send, MessageSquare, Clock } from 'lucide-react';
import { sendEmail } from '../services/emailService';
import toast from 'react-hot-toast';

const Contact = () => {
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRef.current) return;

    try {
      setLoading(true);
      const formData = new FormData(formRef.current);
      const name = formData.get('name') as string;
      const email = formData.get('email') as string;
      const phone = formData.get('phone') as string;
      const message = formData.get('message') as string;

      const subject = `Spice Garden - New Message from ${name} ✉️`;
      const textContent = `You have received a new message via the Spice Garden Contact Form:\n\nSender Details:\n- Name: ${name}\n- Email: ${email}\n- Phone: ${phone}\n\nMessage Details:\n"${message}"`;

      const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New Contact Message</title>
  <style>
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background-color: #fafafa;
      color: #333333;
      padding: 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 15px rgba(0,0,0,0.05);
      border: 1px solid #f0f0f0;
    }
    .header {
      background-color: #ea580c;
      padding: 30px;
      text-align: center;
      color: #ffffff;
    }
    .content {
      padding: 30px;
    }
    h2 {
      margin-top: 0;
      color: #111827;
      border-bottom: 2px solid #ea580c;
      padding-bottom: 10px;
    }
    .field {
      margin-bottom: 15px;
    }
    .label {
      font-weight: bold;
      color: #ea580c;
      font-size: 12px;
      text-transform: uppercase;
    }
    .value {
      font-size: 15px;
      color: #374151;
      margin-top: 2px;
    }
    .msg-box {
      background-color: #f9fafb;
      border: 1px solid #e5e7eb;
      padding: 15px;
      border-radius: 8px;
      white-space: pre-wrap;
      font-style: italic;
    }
    .footer {
      background-color: #f3f4f6;
      padding: 15px;
      text-align: center;
      font-size: 11px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin:0; font-size:24px;">Spice Garden</h1>
      <p style="margin:5px 0 0 0; font-size:12px; text-transform:uppercase; letter-spacing:2px;">Contact Form Notification</p>
    </div>
    <div class="content">
      <h2>New Inquiry Details</h2>
      
      <div class="field">
        <div class="label">Sender Name</div>
        <div class="value">${name}</div>
      </div>
      
      <div class="field">
        <div class="label">Email Address</div>
        <div class="value">${email}</div>
      </div>
      
      <div class="field">
        <div class="label">Phone Number</div>
        <div class="value">${phone || 'N/A'}</div>
      </div>
      
      <div class="field">
        <div class="label">Message</div>
        <div class="msg-box">${message}</div>
      </div>
    </div>
    <div class="footer">
      This notification was sent automatically. Please respond directly to the sender.
    </div>
  </div>
</body>
</html>`;

      await sendEmail({
        toEmail: (import.meta.env.VITE_BREVO_SENDER_EMAIL as string) || 'abc@gmail.com',
        toName: 'Spice Garden Admin',
        subject,
        htmlContent,
        textContent
      });

      toast.success('Message sent! We will get back to you soon.');
      formRef.current.reset();
    } catch (error) {
      console.error('Brevo error:', error);
      toast.error('Failed to send message. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const contactInfo = [
    {
      icon: <Phone className="w-6 h-6" />,
      title: "Call Us",
      details: "+91 9876543210",
      description: "Available for inquiries & orders",
      color: "bg-blue-50 text-blue-600"
    },
    {
      icon: <Mail className="w-6 h-6" />,
      title: "Email Us",
      details: "abc@gmail.com",
      description: "We respond within 24 hours",
      color: "bg-orange-50 text-orange-600"
    },
    {
      icon: <MapPin className="w-6 h-6" />,
      title: "Visit Us",
      details: "123 Spice Garden, Indiranagar, Bengaluru, 560038",
      description: "In the heart of Bengaluru",
      color: "bg-green-50 text-green-600"
    },
    {
      icon: <Clock className="w-6 h-6" />,
      title: "Opening Hours",
      details: "Mon-Sun: 11am - 11pm",
      description: "Open every day of the week",
      color: "bg-purple-50 text-purple-600"
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 pt-32 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <motion.span 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-4 py-1.5 bg-orange-100 text-orange-600 rounded-full text-xs font-bold uppercase tracking-wider mb-4 inline-block"
          >
            Get in touch
          </motion.span>
          <motion.h1 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-6xl font-black text-gray-900 mb-6"
          >
            We'd love to hear <span className="text-orange-600">from you.</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-gray-500 text-lg max-w-2xl mx-auto font-medium"
          >
            Whether you have a question about our menu, reservations, or just want to say hi,
            we're here to help.
          </motion.p>
        </div>

        <div className="grid lg:grid-cols-3 gap-12">
          {/* Contact Info Grid */}
          <div className="lg:col-span-1 space-y-6">
            <div className="grid sm:grid-cols-2 lg:grid-cols-1 gap-6">
              {contactInfo.map((info, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                >
                  <div className={`w-12 h-12 ${info.color} rounded-2xl flex items-center justify-center mb-4`}>
                    {info.icon}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">{info.title}</h3>
                  <p className="text-gray-900 font-bold mb-1">{info.details}</p>
                  <p className="text-gray-500 text-sm">{info.description}</p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-2">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-[3rem] p-8 md:p-12 shadow-sm border border-gray-100"
            >
              <div className="flex items-center gap-4 mb-10">
                <div className="w-12 h-12 bg-orange-600 text-white rounded-2xl flex items-center justify-center">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Send us a Message</h2>
                  <p className="text-gray-500">We'll get back to you as soon as possible</p>
                </div>
              </div>

              <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 ml-1">Full Name</label>
                    <input
                      type="text"
                      name="name"
                      required
                      placeholder="John Doe"
                      className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 transition-all font-medium"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 ml-1">Email Address</label>
                    <input
                      type="email"
                      name="email"
                      required
                      placeholder="john@example.com"
                      className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 ml-1">Mobile Number</label>
                  <input
                    type="tel"
                    inputMode="tel"
                    name="phone"
                    required
                    maxLength={10}
                    onInput={(e) => { e.currentTarget.value = e.currentTarget.value.replace(/\D/g, '').slice(0, 10); }}
                    placeholder="9876543210"
                    className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 transition-all font-medium"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 ml-1">Message</label>
                  <textarea
                    name="message"
                    required
                    rows={6}
                    placeholder="Tell us what's on your mind..."
                    className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 transition-all font-medium resize-none"
                  ></textarea>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full md:w-auto px-12 py-5 bg-orange-600 text-white rounded-2xl font-bold hover:bg-orange-700 transition-all shadow-lg active:scale-95 flex items-center justify-center gap-3 disabled:opacity-70 disabled:active:scale-100"
                >
                  {loading ? (
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      Send Message
                      <Send className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;
