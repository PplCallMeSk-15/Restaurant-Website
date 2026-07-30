import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Star, Clock, Utensils, Award, Phone, Mail, MapPin, Send } from 'lucide-react';
import { motion } from 'motion/react';
import { sendEmail } from '../services/emailService';
import toast from 'react-hot-toast';

const homeImages = {
  hero: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=1200&q=80',
  signature: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80'
};

const Home = () => {
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(false);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRef.current) return;

    try {
      setLoading(true);
      const formData = new FormData(formRef.current);
      const name = formData.get('name') as string;
      const email = formData.get('email') as string;
      const phone = formData.get('phone') as string;
      const message = formData.get('message') as string;

      const subject = `Spice Garden - Support Request from ${name} ✉️`;
      const textContent = `Greetings Admin,\n\nYou have received a new support/contact inquiry from the Spice Garden Home Page:\n\nContact Details:\n- Name: ${name}\n- Email: ${email}\n- Phone: ${phone}\n\nMessage Body:\n"${message}"`;

      const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New Homepage Support Inquiry</title>
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
      <p style="margin:5px 0 0 0; font-size:12px; text-transform:uppercase; letter-spacing:2px;">Homepage Support Inquiry</p>
    </div>
    <div class="content">
      <h2>New Support Details</h2>
      
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
      Please follow up with the customer directly.
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

      toast.success('Message sent successfully!');
      formRef.current.reset();
    } catch (error) {
      console.error('Email error:', error);
      toast.error('Failed to send message.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-20">
      {/* Hero Section */}
      <section className="relative h-[80vh] md:h-[85vh] flex items-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src={homeImages.hero}
            alt="Spice Garden Hero"
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-white">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-2xl"
          >
            <h1 className="text-5xl md:text-7xl font-bold leading-tight mb-6">
               Elevate Your <span className="text-orange-500">Palate</span> with Authenticity
            </h1>
            <p className="text-lg md:text-xl text-gray-200 mb-10 leading-relaxed">
              Experience the perfect blend of traditional spices and modern culinary techniques at Spice Garden.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                to="/menu"
                className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-4 rounded-full font-bold text-lg flex items-center justify-center transition-all shadow-xl shadow-orange-900/20"
              >
                Explore Menu <ChevronRight className="ml-2 w-5 h-5" />
              </Link>
              <Link
                to="/reservations"
                className="bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/30 px-8 py-4 rounded-full font-bold text-lg flex items-center justify-center transition-all"
              >
                Book a Table
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="text-center group">
              <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600 mb-6 mx-auto group-hover:bg-orange-600 group-hover:text-white transition-all duration-300">
                <Utensils className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-4">Fresh Ingredients</h3>
              <p className="text-gray-600">Sourced daily from local organic farms to ensure the highest quality in every bite.</p>
            </div>
            <div className="text-center group">
              <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600 mb-6 mx-auto group-hover:bg-orange-600 group-hover:text-white transition-all duration-300">
                < Award className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-4">Expert Chefs</h3>
              <p className="text-gray-600">Our world-class chefs bring decades of experience in authentic spice-based cuisines.</p>
            </div>
            <div className="text-center group">
              <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600 mb-6 mx-auto group-hover:bg-orange-600 group-hover:text-white transition-all duration-300">
                <Clock className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-4">Fast Delivery</h3>
              <p className="text-gray-600">Enjoy our signature dishes at your doorstep within 30 minutes, piping hot and fresh.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Dish */}
      <section className="py-24 bg-gray-50 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <div className="flex-1">
              <div className="relative">
                <motion.div
                  initial={{ opacity: 0, rotate: -5, scale: 0.95 }}
                  whileInView={{ opacity: 1, rotate: 0, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1 }}
                >
                  <img
                    src={homeImages.signature}
                    alt="Signature Dish"
                    className="rounded-[2.5rem] shadow-2xl relative z-10 w-full block object-cover min-h-[300px] md:min-h-[450px] bg-gray-200"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                </motion.div>
                <div className="absolute -top-10 -right-10 w-64 h-64 bg-orange-200 rounded-full blur-3xl opacity-30 z-0" />
                <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-orange-300 rounded-full blur-3xl opacity-20 z-0" />
              </div>
            </div>
            <div className="flex-1">
              <span className="text-orange-600 font-bold uppercase tracking-wider text-sm mb-4 block">Chef's Signature</span>
              <h2 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900 leading-tight">Authentic Rogan Josh</h2>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                Tender lamb slow-cooked in a rich gravy of aromatic Kashmiri spices, ginger, and yogurt. A royal delicacy that melts in your mouth and leaves a lingering warmth.
              </p>
              <div className="flex items-center space-x-4 mb-10">
                 <div className="flex text-orange-400">
                    {[1,2,3,4,5].map(i => <Star key={i} className="w-5 h-5 fill-current" />)}
                 </div>
                 <span className="text-gray-500 font-medium">(2,400+ reviews)</span>
              </div>
              <Link
                to="/menu"
                className="inline-flex items-center text-orange-600 font-bold text-lg group"
              >
                Order this dish online <ChevronRight className="ml-2 w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-24 bg-gray-900 text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 w-1/3 h-full bg-orange-600/10 skew-x-12 translate-x-1/2 z-0" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-20 items-center">
            <div>
              <motion.span 
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                className="text-orange-500 font-bold uppercase tracking-widest text-sm mb-4 block"
              >
                Contact Us
              </motion.span>
              <h2 className="text-4xl md:text-5xl font-bold mb-8 leading-tight">
                Have Question? <br />
                <span className="text-gray-400">Reach out to us</span>
              </h2>
              
              <div className="space-y-8 mb-12">
                <div className="flex items-start gap-6 group">
                  <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-orange-600 transition-colors">
                    <Phone className="w-6 h-6 text-orange-500 group-hover:text-white" />
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm font-medium uppercase tracking-wider mb-1">Phone Number</p>
                    <p className="text-2xl font-bold">+91 9876543210</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-6 group">
                  <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-orange-600 transition-colors">
                    <Mail className="w-6 h-6 text-orange-500 group-hover:text-white" />
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm font-medium uppercase tracking-wider mb-1">Email Address</p>
                    <p className="text-2xl font-bold">abc@gmail.com</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-6 group">
                  <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-orange-600 transition-colors">
                    <MapPin className="w-6 h-6 text-orange-500 group-hover:text-white" />
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm font-medium uppercase tracking-wider mb-1">Our Location</p>
                    <p className="text-2xl font-bold">123 Fusion Street, NY 10001</p>
                  </div>
                </div>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              className="bg-white/5 backdrop-blur-xl p-10 rounded-[3rem] border border-white/10"
            >
              <form ref={formRef} onSubmit={handleContactSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-400 ml-1">Your Name</label>
                  <input
                    type="text"
                    name="name"
                    required
                    placeholder="Enter your name"
                    className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-orange-500 text-white transition-all outline-none placeholder:text-gray-600"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-400 ml-1">Email Address</label>
                  <input
                    type="email"
                    name="email"
                    required
                    placeholder="Enter your email"
                    className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-orange-500 text-white transition-all outline-none placeholder:text-gray-600"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-400 ml-1">Mobile Number</label>
                  <input
                    type="tel"
                    inputMode="tel"
                    name="phone"
                    required
                    maxLength={10}
                    onInput={(e) => { e.currentTarget.value = e.currentTarget.value.replace(/\D/g, '').slice(0, 10); }}
                    placeholder="Enter your mobile number"
                    className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-orange-500 text-white transition-all outline-none placeholder:text-gray-600"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-400 ml-1">Message</label>
                  <textarea
                    name="message"
                    required
                    rows={4}
                    placeholder="Describe your inquiry..."
                    className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-orange-500 text-white transition-all outline-none resize-none placeholder:text-gray-600"
                  ></textarea>
                </div>
                
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-5 bg-orange-600 hover:bg-orange-700 text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? 'Sending...' : (
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
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-white relative">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-4xl font-bold mb-8 italic">Interested in catering or bulk orders?</h2>
            <div className="flex flex-center justify-center space-x-6">
                <a href="tel:+919876543210" className="flex items-center space-x-2 text-xl font-bold text-gray-900 hover:text-orange-600 transition-colors">
                  <Phone className="w-6 h-6" />
                  <span>Call us: +91 9876543210</span>
                </a>
            </div>
         </div>
      </section>
    </div>
  );
};

export default Home;
