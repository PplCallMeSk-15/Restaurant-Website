import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin, Instagram, Facebook, Twitter, Utensils } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="bg-gray-900 text-white pt-24 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-16 mb-20">
          <div className="space-y-6">
            <Link to="/" className="flex items-center space-x-2 group">
                <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center text-white transform group-hover:rotate-12 transition-transform shadow-lg shadow-orange-900/40">
                <span className="text-xl font-bold">S</span>
                </div>
                <span className="text-2xl font-bold tracking-tight">
                Spice<span className="text-orange-600">Garden</span>
                </span>
            </Link>
            <p className="text-gray-400 leading-relaxed">
              Bringing the authentic flavors of heritage spices to your table since 1998. Experience the art of culinary excellence.
            </p>
            <div className="flex space-x-4">
              <a href="#" className="p-3 bg-white/5 rounded-xl hover:bg-orange-600 hover:text-white transition-all"><Instagram className="w-5 h-5" /></a>
              <a href="#" className="p-3 bg-white/5 rounded-xl hover:bg-orange-600 hover:text-white transition-all"><Facebook className="w-5 h-5" /></a>
              <a href="#" className="p-3 bg-white/5 rounded-xl hover:bg-orange-600 hover:text-white transition-all"><Twitter className="w-5 h-5" /></a>
            </div>
          </div>

          <div>
            <h4 className="text-lg font-bold mb-8 uppercase tracking-widest text-[#ea580c]">Quick Links</h4>
            <ul className="space-y-4 text-gray-400 font-medium">
              <li><Link to="/menu" className="hover:text-white transition-colors">Our Menu</Link></li>
              <li><Link to="/reservations" className="hover:text-white transition-colors">Book a Table</Link></li>
              <li><Link to="/contact" className="hover:text-white transition-colors">Contact Us</Link></li>
              <li>
                <Link 
                  to={localStorage.getItem('delivery_partner_session') ? "/delivery-partner" : "/delivery-partner/login"} 
                  className="text-orange-500 hover:text-orange-400 hover:underline transition-all flex items-center gap-1.5"
                >
                  <span>🚚 Driver Fleet Shift</span>
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-lg font-bold mb-8 uppercase tracking-widest text-orange-600">Hours</h4>
            <ul className="space-y-4 text-gray-400 font-medium">
              <li className="flex justify-between"><span>Mon - Thu</span> <span>11 AM - 10 PM</span></li>
              <li className="flex justify-between"><span>Fri - Sat</span> <span>11 AM - 11 PM</span></li>
              <li className="flex justify-between"><span>Sunday</span> <span>12 PM - 10 PM</span></li>
            </ul>
          </div>

          <div>
            <h4 className="text-lg font-bold mb-8 uppercase tracking-widest text-orange-600">Contact</h4>
            <ul className="space-y-6 text-gray-400 font-medium">
              <li className="flex items-start">
                <MapPin className="w-5 h-5 mr-4 text-orange-600 shrink-0" />
                <span>123 Spice Garden Landmark, Indiranagar, Bengaluru, Karnataka 560038</span>
              </li>
              <li className="flex items-center">
                <Phone className="w-5 h-5 mr-4 text-orange-600 shrink-0" />
                <span>+91 9876543210</span>
              </li>
              <li className="flex items-center">
                <Mail className="w-5 h-5 mr-4 text-orange-600 shrink-0" />
                <span>abc@gmail.com</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-12 border-t border-white/5 text-center text-gray-500 text-sm font-medium">
          <p>© {new Date().getFullYear()} Spice Garden Restaurant. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
