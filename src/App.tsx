import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, serverTimestamp, doc, getDocFromServer } from 'firebase/firestore';
import { db, auth } from './firebase';
import { doctorImageBase64 } from './doctorImage';

declare global {
  interface Window {
    AOS: any;
  }
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [activePage, setActivePage] = useState('home');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  
  const testimonialTrackRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const countersStartedRef = useRef(false);

  // AOS Init
  useEffect(() => {
    if (window.AOS) {
      window.AOS.init({
        duration: 700,
        easing: 'ease-out-cubic',
        once: true,
        offset: 60
      });
    }
  }, []);

  // Header Scroll Effect
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Navigation logic
  const showPage = (pageId: string) => {
    setActivePage(pageId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setIsMenuOpen(false);
    // Refresh AOS
    setTimeout(() => {
      if (window.AOS) window.AOS.refresh();
    }, 100);
  };

  const scrollToSection = (id: string) => {
    setActivePage('home');
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  };

  // Slider Logic
  const totalSlides = 5;
  const nextSlide = () => {
    setSlideIndex(prev => {
      const updated = prev + 1;
      return updated >= totalSlides ? 0 : updated;
    });
  };
  const prevSlide = () => {
    setSlideIndex(prev => {
      const updated = prev - 1;
      return updated < 0 ? totalSlides - 1 : updated;
    });
  };

  useEffect(() => {
    const interval = setInterval(nextSlide, 4500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (testimonialTrackRef.current) {
      const visibleSlides = window.innerWidth < 768 ? 1 : window.innerWidth < 1024 ? 2 : 3;
      const cardWidth = testimonialTrackRef.current.children[0].getBoundingClientRect().width + 24;
      const effectiveIndex = Math.min(slideIndex, totalSlides - visibleSlides);
      testimonialTrackRef.current.style.transform = `translateX(-${effectiveIndex * cardWidth}px)`;
    }
  }, [slideIndex]);

  // Statistics Counter Logic
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !countersStartedRef.current) {
        countersStartedRef.current = true;
        animateCounters();
      }
    }, { threshold: 0.3 });

    if (statsRef.current) observer.observe(statsRef.current);
    return () => observer.disconnect();
  }, []);

  // Counters Logic
  const animateCounters = () => {
    const counters = document.querySelectorAll('[data-target]');
    counters.forEach(el => {
      const target = parseInt(el.getAttribute('data-target') || '0');
      const suffix = el.getAttribute('data-suffix') || '+';
      let current = 0;
      const increment = target / 60;
      const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
          current = target;
          clearInterval(timer);
          el.textContent = target + suffix;
        } else {
          el.textContent = Math.floor(current) + suffix;
        }
      }, 25);
    });
  };

  // Firebase Connection Test
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const formData = new FormData(e.currentTarget);
    const appointmentData = {
      fullName: formData.get('fullName') as string,
      phoneNumber: formData.get('phoneNumber') as string,
      service: formData.get('service') as string,
      preferredDate: formData.get('preferredDate') as string,
      message: formData.get('message') as string || "",
      status: 'pending',
      createdAt: serverTimestamp()
    };

    const path = 'appointments';
    try {
      await addDoc(collection(db, path), appointmentData);
      
      // Send Email Notification via FormSubmit.co
      // Note: First time submission requires email activation from FormSubmit.co
      try {
        await fetch("https://formsubmit.co/ajax/naveenkrr96@gmail.com", {
          method: "POST",
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            "Subject": "New Appointment Request - PSHCC",
            "Name": appointmentData.fullName,
            "Phone": appointmentData.phoneNumber,
            "Service": appointmentData.service,
            "Date": appointmentData.preferredDate,
            "Message": appointmentData.message,
            "_captcha": "false" // Disable captcha for AJAX
          })
        });
      } catch (emailError) {
        console.error("Email notification failed, but data saved to Firebase:", emailError);
      }

      setFormSubmitted(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* HEADER */}
      <header className={`header ${isScrolled ? 'scrolled' : ''}`} id="header">
        <div className="nav-container">
          <div className="logo" onClick={() => showPage('home')}>
            <div className="logo-icon">P</div>
            <div className="logo-text">
              <div className="logo-title">PSHCC</div>
              <div className="logo-tag">Speech & Hearing Care</div>
            </div>
          </div>

          <nav className="nav-links">
            <span className={`nav-link ${activePage === 'home' ? 'active' : ''}`} onClick={() => showPage('home')}>Home</span>
            <span className={`nav-link ${activePage === 'services' ? 'active' : ''}`} onClick={() => showPage('services')}>Services</span>
            <span className={`nav-link ${activePage === 'about' ? 'active' : ''}`} onClick={() => showPage('about')}>About</span>
            <span className="nav-link" onClick={() => scrollToSection('reviews-section')}>Reviews</span>
            <span className={`nav-link ${activePage === 'contact' ? 'active' : ''}`} onClick={() => showPage('contact')}>Contact</span>
            <span className="nav-link nav-cta" onClick={() => showPage('contact')}>Book Appointment</span>
          </nav>

          <div className={`hamburger ${isMenuOpen ? 'open' : ''}`} id="hamburger" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            <span></span><span></span><span></span>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      <div className={`mobile-menu ${isMenuOpen ? 'open' : ''}`} id="mobileMenu">
        <span className="nav-link" onClick={() => { showPage('home'); setIsMenuOpen(false); }}>🏠 Home</span>
        <span className="nav-link" onClick={() => { showPage('services'); setIsMenuOpen(false); }}>🔧 Services</span>
        <span className="nav-link" onClick={() => { showPage('about'); setIsMenuOpen(false); }}>ℹ️ About Us</span>
        <span className="nav-link" onClick={() => { scrollToSection('reviews-section'); setIsMenuOpen(false); }}>⭐ Reviews</span>
        <span className="nav-link" onClick={() => { showPage('contact'); setIsMenuOpen(false); }}>📞 Contact</span>
        <span className="nav-link nav-cta" onClick={() => { showPage('contact'); setIsMenuOpen(false); }}>📅 Book Appointment</span>
      </div>

      {/* HOME PAGE */}
      <div className={`page ${activePage === 'home' ? 'active' : ''}`} id="page-home">
        <section className="hero">
          <div className="hero-bg">
            <div className="hero-orb hero-orb-1"></div>
            <div className="hero-orb hero-orb-2"></div>
            <div className="hero-orb hero-orb-3"></div>
            <div className="hero-grid"></div>
          </div>

          <div className="hero-content">
            <div className="hero-left">
              <div className="hero-badge" data-aos="fade-down">
                <i className="fas fa-star" style={{ color: 'var(--gold)' }}></i>
                5.0 Google Rated Clinic in Bihar
              </div>
              <h1 className="hero-h1" data-aos="fade-up" data-aos-delay="100">
                Bihar's Most <span className="gold">Trusted</span> Speech &amp; Hearing Care Clinic
              </h1>
              <p className="hero-sub" data-aos="fade-up" data-aos-delay="200">
                Expert Audiologists &amp; Speech Therapists in Patna — Helping You Hear and Speak Better with personalized, compassionate care.
              </p>
              <div className="hero-btns" data-aos="fade-up" data-aos-delay="300">
                <a className="btn-gold" onClick={() => showPage('contact')}>
                  <i className="fas fa-calendar-check"></i> Book Appointment
                </a>
                <a className="btn-outline" href="tel:+917295962124">
                  <i className="fas fa-phone"></i> Call: 07295962124
                </a>
              </div>
            </div>

            <div className="hero-visual" data-aos="fade-left" data-aos-delay="200">
              <div className="hero-card-stack">
                <div className="hero-main-card">
                  <div className="hc-rating">
                    <div>
                      <div className="hc-stars">★★★★★</div>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <span className="hc-rat-text">5.0</span>
                        <span className="hc-rat-sub">Google Rating</span>
                      </div>
                    </div>
                  </div>
                  <div className="hc-divider"></div>
                  <div className="hc-service">
                    <div className="hc-service-icon">🦻</div>
                    <div>
                      <div className="hc-service-text">Hearing Aids</div>
                      <div className="hc-service-sub">Advanced solutions</div>
                    </div>
                  </div>
                  <div className="hc-service">
                    <div className="hc-service-icon">🗣️</div>
                    <div>
                      <div className="hc-service-text">Speech Therapy</div>
                      <div className="hc-service-sub">Expert therapists</div>
                    </div>
                  </div>
                  <div className="hc-service">
                    <div className="hc-service-icon">📊</div>
                    <div>
                      <div className="hc-service-text">Audiometry Test</div>
                      <div className="hc-service-sub">Precise diagnosis</div>
                    </div>
                  </div>
                  <div className="hc-service">
                    <div className="hc-service-icon">🔋</div>
                    <div>
                      <div className="hc-service-text">Digital Hearing Aids</div>
                      <div className="hc-service-sub">Rechargeable &amp; smart</div>
                    </div>
                  </div>
                </div>
                <div className="hero-float-badge b1">
                  <div className="badge-num">41+</div>
                  <div className="badge-label">Happy Patients</div>
                </div>
                <div className="hero-float-badge b2">
                  <div className="badge-num" style={{ fontSize: '16px' }}>7 Days</div>
                  <div className="badge-label">Always Open</div>
                </div>
              </div>
            </div>
          </div>

          <div className="hero-wave">
            <svg viewBox="0 0 1440 60" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
              <path d="M0,40 C360,80 1080,0 1440,40 L1440,60 L0,60 Z" fill="#ffffff" />
            </svg>
          </div>
        </section>

        {/* STATS */}
        <section className="stats" ref={statsRef}>
          <div className="stats-inner">
            <div className="stat-card" data-aos="fade-up" data-aos-delay="0">
              <div className="stat-icon"><i className="fas fa-smile"></i></div>
              <div className="stat-num" data-target="41">0</div>
              <div className="stat-label">Happy Patients &amp; Growing</div>
            </div>
            <div className="stat-card" data-aos="fade-up" data-aos-delay="100">
              <div className="stat-icon"><i className="fas fa-star"></i></div>
              <div className="stat-num" id="stat-rating">5.0</div>
              <div className="stat-label">⭐ Google Rating</div>
            </div>
            <div className="stat-card" data-aos="fade-up" data-aos-delay="200">
              <div className="stat-icon"><i className="fas fa-stethoscope"></i></div>
              <div className="stat-num" data-target="4">0</div>
              <div className="stat-label">Expert Services</div>
            </div>
            <div className="stat-card" data-aos="fade-up" data-aos-delay="300">
              <div className="stat-icon"><i className="fas fa-calendar-days"></i></div>
              <div className="stat-num" data-target="7">0</div>
              <div className="stat-label">Days a Week Open</div>
            </div>
          </div>
        </section>

        {/* SERVICES PREVIEW */}
        <section className="services-grid-section">
          <div className="section-header" data-aos="fade-up">
            <div className="section-tag">Our Expertise</div>
            <h2 className="section-title">Comprehensive Care Services</h2>
            <p className="section-sub">From advanced hearing aids to professional speech therapy — we provide complete solutions for your hearing and speech health.</p>
          </div>

          <div className="services-grid">
            <div className="service-card" data-aos="fade-up" onClick={() => showPage('services')}>
              <div className="sc-icon-wrap">🦻</div>
              <div className="sc-title">Hearing Aids</div>
              <div className="sc-desc">Advanced hearing aids for all age groups — from mild to profound hearing loss. We offer the best brands with expert fitting.</div>
              <div className="sc-link">Explore Service <i className="fas fa-arrow-right"></i></div>
            </div>
            <div className="service-card" data-aos="fade-up" data-aos-delay="100" onClick={() => showPage('services')}>
              <div className="sc-icon-wrap">🗣️</div>
              <div className="sc-title">Speech Therapy</div>
              <div className="sc-desc">Professional therapy for speech disorders — including stuttering, articulation, language delay, and post-stroke communication.</div>
              <div className="sc-link">Explore Service <i className="fas fa-arrow-right"></i></div>
            </div>
            <div className="service-card" data-aos="fade-up" data-aos-delay="200" onClick={() => showPage('services')}>
              <div className="sc-icon-wrap">📊</div>
              <div className="sc-title">Audiometry Test</div>
              <div className="sc-desc">Accurate hearing evaluation &amp; diagnosis using state-of-the-art audiometric equipment for all ages including newborns.</div>
              <div className="sc-link">Explore Service <i className="fas fa-arrow-right"></i></div>
            </div>
            <div className="service-card" data-aos="fade-up" data-aos-delay="300" onClick={() => showPage('services')}>
              <div className="sc-icon-wrap">🔋</div>
              <div className="sc-title">Digital Rechargeable Hearing Aids</div>
              <div className="sc-desc">Modern, eco-friendly rechargeable hearing solutions — no more battery hassle. Crystal-clear digital sound quality.</div>
              <div className="sc-link">Explore Service <i className="fas fa-arrow-right"></i></div>
            </div>
          </div>
        </section>

        {/* WHY CHOOSE US */}
        <section className="section section-alt">
          <div className="section-header" data-aos="fade-up">
            <div className="section-tag">Why Us</div>
            <h2 className="section-title">Why Patients Trust Us</h2>
            <p className="section-sub">We combine medical expertise with genuine compassion to deliver outcomes that truly change lives.</p>
          </div>
          <div className="why-grid container">
            <div className="why-card" data-aos="fade-up">
              <div className="why-icon"><i className="fas fa-user-doctor"></i></div>
              <div className="why-title">Experienced Audiologists</div>
              <div className="why-desc">Our certified audiologists bring years of clinical expertise in hearing assessment and fitting across all patient demographics.</div>
            </div>
            {/* Additional Why cards follow same pattern... */}
            <div className="why-card" data-aos="fade-up" data-aos-delay="80">
              <div className="why-icon"><i className="fas fa-tags"></i></div>
              <div className="why-title">Affordable Pricing</div>
              <div className="why-desc">We believe quality hearing care should be accessible. We offer competitive pricing with no compromise on quality of service.</div>
            </div>
            <div className="why-card" data-aos="fade-up" data-aos-delay="160">
              <div className="why-icon"><i className="fas fa-microchip"></i></div>
              <div className="why-title">State-of-the-Art Technology</div>
              <div className="why-desc">From digital audiometry to the latest rechargeable hearing devices — we invest in the best equipment for your care.</div>
            </div>
            <div className="why-card" data-aos="fade-up" data-aos-delay="240">
              <div className="why-icon"><i className="fas fa-heart-pulse"></i></div>
              <div className="why-title">Personalized Care</div>
              <div className="why-desc">Every patient receives an individualized treatment plan tailored to their unique hearing profile and lifestyle needs.</div>
            </div>
            <div className="why-card" data-aos="fade-up" data-aos-delay="320">
              <div className="why-icon"><i className="fas fa-star"></i></div>
              <div className="why-title">5 Star Rated Clinic</div>
              <div className="why-desc">Proud to maintain a perfect 5.0 ⭐ rating on Google — a testament to our patients' satisfaction and our quality of care.</div>
            </div>
            <div className="why-card" data-aos="fade-up" data-aos-delay="400">
              <div className="why-icon"><i className="fas fa-clock"></i></div>
              <div className="why-title">Open 7 Days a Week</div>
              <div className="why-desc">We know hearing health can't wait. Visit us Mon–Sat 9AM–9PM or Sunday 9AM–2PM. We're always here for you.</div>
            </div>
          </div>
        </section>

        {/* MEET THE DOCTOR SECTION - RE-STLYED FOR SEO & MOBILE */}
        <section className="section bg-white" aria-labelledby="doctor-heading">
          <div className="container">
            <div className="max-w-5xl mx-auto">
              <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
                <div className="w-full lg:w-2/5" data-aos="fade-right">
                  <div className="relative group">
                    <div className="absolute -inset-2 bg-gradient-to-r from-[#c9a84c] to-[#1a3c6e] rounded-[40px] blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
                    <div className="relative aspect-square overflow-hidden rounded-[35px] border-4 border-white shadow-2xl">
                      <img 
                        src={doctorImageBase64} 
                        alt="Dr. Naveen Kumar - Audiologist & Speech Therapist" 
                        className="w-full h-full object-cover object-top hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-[#1a3c6e] text-white px-6 py-2 rounded-xl shadow-xl z-10 whitespace-nowrap border-2 border-white">
                      <div className="text-xs font-black opacity-80 uppercase tracking-tighter">RCI Registered</div>
                      <div className="text-lg font-bold leading-none">A120698</div>
                    </div>
                  </div>
                </div>
                
                <div className="w-full lg:w-3/5 text-center lg:text-left" data-aos="fade-left">
                  <div className="section-tag mb-4 inline-block">Director's Profile</div>
                  <h2 id="doctor-heading" className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#0f2548] leading-tight mb-4 tracking-tight">
                    Naveen Kumar
                  </h2>
                  <div className="text-[#c9a84c] font-bold text-lg sm:text-xl uppercase tracking-widest mb-2">
                    Founder & Chief Audiologist
                  </div>
                  <h3 className="text-xl text-slate-700 font-semibold mb-6">
                    DHLS (MUMBAI), B.ASLP (P.P.U)
                  </h3>
                  <p className="sd-desc text-slate-600 leading-relaxed mb-8 text-base sm:text-lg italic">
                    "Better hearing starts with expert care. My mission is to ensure that every patient in Bihar has access to the world's best hearing technology and compassionate speech therapy."
                  </p>
                  <div className="flex flex-wrap gap-4 mb-10 justify-center lg:justify-start">
                    <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-lg border border-slate-100">
                      <i className="fas fa-check-circle text-[#c9a84c]"></i>
                      <span className="text-slate-700 font-medium text-sm sm:text-base">10+ Years Expertise</span>
                    </div>
                    <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-lg border border-slate-100">
                      <i className="fas fa-check-circle text-[#c9a84c]"></i>
                      <span className="text-slate-700 font-medium text-sm sm:text-base">Trained in Mumbai</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => showPage('contact')} 
                    className="btn-gold inline-flex items-center gap-3 px-8 py-4 rounded-2xl shadow-xl hover:scale-105 transition-all w-full sm:w-auto justify-center"
                  >
                    <i className="fas fa-calendar-check" aria-hidden="true"></i>
                    <span>Schedule an Appointment</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* TESTIMONIALS */}
        <section className="testimonials-section" id="reviews-section">
          <div className="section-header" data-aos="fade-up">
            <div className="section-tag">Patient Reviews</div>
            <h2 className="section-title">What Our Patients Say</h2>
            <p className="section-sub">Real stories from real people whose lives we've helped transform through better hearing and speech.</p>
          </div>

          <div className="testimonial-slider" data-aos="fade-up">
            <div className="testimonial-track" ref={testimonialTrackRef}>
              <div className="testimonial-card">
                <div className="tc-header">
                  <div className="tc-avatar">K</div>
                  <div className="tc-google">G</div>
                </div>
                <div className="tc-stars">★★★★★</div>
                <div className="tc-name">Mr. K Kumar</div>
                <div className="tc-text">"I am very happy with this hearing aid. The sound quality is clear and natural. Now I can hear conversations and TV much better. Highly recommended!"</div>
              </div>

              <div className="testimonial-card">
                <div className="tc-header">
                  <div className="tc-avatar">N</div>
                  <div className="tc-google">G</div>
                </div>
                <div className="tc-stars">★★★★★</div>
                <div className="tc-name">Nikita Kumari</div>
                <div className="tc-text">"I purchased a hearing aid from this clinic for my maternal grandfather. It is worth it. My grandfather feels so comfortable after using this hearing aid."</div>
              </div>

              <div className="testimonial-card">
                <div className="tc-header">
                  <div className="tc-avatar">P</div>
                  <div className="tc-google">G</div>
                </div>
                <div className="tc-stars">★★★★★</div>
                <div className="tc-name">Priyanka Kumari</div>
                <div className="tc-text">"Good behaviour of therapist and they work like professionals. Best centre for speech and hearing aid service. I strongly recommend this clinic."</div>
              </div>

              <div className="testimonial-card">
                <div className="tc-header">
                  <div className="tc-avatar">A</div>
                  <div className="tc-google">G</div>
                </div>
                <div className="tc-stars">★★★★★</div>
                <div className="tc-name">Abhishant Kumar</div>
                <div className="tc-text">"Best hearing aid clinic in Patna, doctors are very polite and helpful. They take great care of every patient and provide excellent guidance."</div>
              </div>

              <div className="testimonial-card">
                <div className="tc-header">
                  <div className="tc-avatar">A</div>
                  <div className="tc-google">G</div>
                </div>
                <div className="tc-stars">★★★★★</div>
                <div className="tc-name">Arun Yadav</div>
                <div className="tc-text">"Best hearing aid centre. Good behaviour and after sale service. The staff is very supportive and always ready to help with any issues."</div>
              </div>
            </div>
          </div>

          <div className="slider-controls">
            <button className="slider-btn" onClick={prevSlide}><i className="fas fa-chevron-left"></i></button>
            <div className="slider-dots" id="sliderDots">
              {[0, 1, 2].map(i => (
                <div key={i} className={`slider-dot ${Math.min(slideIndex, 2) === i ? 'active' : ''}`} onClick={() => setSlideIndex(i)}></div>
              ))}
            </div>
            <button className="slider-btn" onClick={nextSlide}><i className="fas fa-chevron-right"></i></button>
          </div>
        </section>

        {/* CTA BANNER */}
        <section className="cta-banner" data-aos="fade-up">
          <h2>Ready to Improve Your Hearing?</h2>
          <p>Book a free consultation with our expert audiologists today</p>
          <a href="tel:+917295962124" className="btn-blue">
            <i className="fas fa-phone-volume"></i> Call Now: 07295962124
          </a>
        </section>

        {/* FOOTER */}
        <Footer showPage={showPage} scrollToSection={scrollToSection} />
      </div>

      {/* SERVICES PAGE */}
      <div className={`page ${activePage === 'services' ? 'active' : ''}`} id="page-services">
        <div className="services-page">
          <div className="services-page-hero">
            <div className="hero-badge" data-aos="fade-down" style={{ margin: '0 auto 20px', width: 'fit-content' }}>
              <i className="fas fa-star" style={{ color: 'var(--gold)' }}></i> Expert Care Services
            </div>
            <h1 data-aos="fade-up">Our Specialised Services</h1>
            <p data-aos="fade-up" data-aos-delay="100">Comprehensive hearing and speech solutions delivered by trained professionals using the latest technology.</p>
          </div>

          <div className="service-detail-grid">
            <div className="service-detail" data-aos="fade-up">
              <div className="sd-visual">🦻</div>
              <div className="sd-content">
                <div className="sd-tag"><i className="fas fa-circle-check"></i> Hearing Solutions</div>
                <h2 className="sd-title">Hearing Aids</h2>
                <p className="sd-desc">We offer a comprehensive range of hearing aids designed to suit every patient's specific hearing profile, lifestyle, and budget. Our expert audiologists conduct thorough assessments before recommending the most suitable device — ensuring optimal performance and comfort.</p>
                <div className="sd-benefits">
                  <div className="sd-benefit"><div className="sd-benefit-icon"><i className="fas fa-check"></i></div>Fitting for mild to profound hearing loss</div>
                  <div className="sd-benefit"><div className="sd-benefit-icon"><i className="fas fa-check"></i></div>Top international brands available</div>
                  <div className="sd-benefit"><div className="sd-benefit-icon"><i className="fas fa-check"></i></div>Trial period for new users</div>
                  <div className="sd-benefit"><div className="sd-benefit-icon"><i className="fas fa-check"></i></div>After-sale service and maintenance support</div>
                  <div className="sd-benefit"><div className="sd-benefit-icon"><i className="fas fa-check"></i></div>Solutions for all age groups including children</div>
                </div>
                <a className="btn-gold" onClick={() => showPage('contact')} style={{ width: 'fit-content', marginTop: '8px' }}>
                  <i className="fas fa-calendar-check"></i> Book This Service
                </a>
              </div>
            </div>

            <div className="service-detail reverse" data-aos="fade-up">
              <div className="sd-visual">🗣️</div>
              <div className="sd-content">
                <div className="sd-tag"><i className="fas fa-circle-check"></i> Speech &amp; Language</div>
                <h2 className="sd-title">Speech Therapy</h2>
                <p className="sd-desc">Our certified speech-language therapists provide evidence-based therapy for a wide range of communication disorders. We work with children and adults alike, providing structured therapy sessions with measurable progress tracking and family involvement.</p>
                <div className="sd-benefits">
                  <div className="sd-benefit"><div className="sd-benefit-icon"><i className="fas fa-check"></i></div>Therapy for stuttering and fluency disorders</div>
                  <div className="sd-benefit"><div className="sd-benefit-icon"><i className="fas fa-check"></i></div>Language delay treatment for children</div>
                  <div className="sd-benefit"><div className="sd-benefit-icon"><i className="fas fa-check"></i></div>Articulation and pronunciation improvement</div>
                  <div className="sd-benefit"><div className="sd-benefit-icon"><i className="fas fa-check"></i></div>Post-stroke communication rehabilitation</div>
                  <div className="sd-benefit"><div className="sd-benefit-icon"><i className="fas fa-check"></i></div>Autism spectrum communication support</div>
                </div>
                <a className="btn-gold" onClick={() => showPage('contact')} style={{ width: 'fit-content', marginTop: '8px' }}>
                  <i className="fas fa-calendar-check"></i> Book This Service
                </a>
              </div>
            </div>

            <div className="service-detail" data-aos="fade-up">
              <div className="sd-visual">📊</div>
              <div className="sd-content">
                <div className="sd-tag"><i className="fas fa-circle-check"></i> Diagnostic Testing</div>
                <h2 className="sd-title">Audiometry Test</h2>
                <p className="sd-desc">Accurate hearing evaluation and diagnosis is the foundation of effective treatment. Our state-of-the-art audiometry equipment provides precise measurements of hearing sensitivity across all frequencies, allowing us to create targeted intervention plans.</p>
                <div className="sd-benefits">
                  <div className="sd-benefit"><div className="sd-benefit-icon"><i className="fas fa-check"></i></div>Pure tone audiometry (PTA) testing</div>
                  <div className="sd-benefit"><div className="sd-benefit-icon"><i className="fas fa-check"></i></div>Speech discrimination assessment</div>
                  <div className="sd-benefit"><div className="sd-benefit-icon"><i className="fas fa-check"></i></div>Tympanometry and middle ear evaluation</div>
                  <div className="sd-benefit"><div className="sd-benefit-icon"><i className="fas fa-check"></i></div>Newborn hearing screening available</div>
                  <div className="sd-benefit"><div className="sd-benefit-icon"><i className="fas fa-check"></i></div>Detailed audiogram report provided</div>
                </div>
                <a className="btn-gold" onClick={() => showPage('contact')} style={{ width: 'fit-content', marginTop: '8px' }}>
                  <i className="fas fa-calendar-check"></i> Book This Service
                </a>
              </div>
            </div>

            <div className="service-detail reverse" data-aos="fade-up">
              <div className="sd-visual">🔋</div>
              <div className="sd-content">
                <div className="sd-tag"><i className="fas fa-circle-check"></i> Modern Technology</div>
                <h2 className="sd-title">Digital Rechargeable Hearing Aids</h2>
                <p className="sd-desc">Embrace the future of hearing health with our premium digital rechargeable hearing aids. Eliminating the inconvenience of disposable batteries, these devices offer exceptional sound quality, wireless connectivity, and long battery life — all in a sleek, discreet design.</p>
                <div className="sd-benefits">
                  <div className="sd-benefit"><div className="sd-benefit-icon"><i className="fas fa-check"></i></div>All-day use on a single charge</div>
                  <div className="sd-benefit"><div className="sd-benefit-icon"><i className="fas fa-check"></i></div>Bluetooth connectivity to phones &amp; TV</div>
                  <div className="sd-benefit"><div className="sd-benefit-icon"><i className="fas fa-check"></i></div>Eco-friendly — no disposable batteries</div>
                  <div className="sd-benefit"><div className="sd-benefit-icon"><i className="fas fa-check"></i></div>AI-powered noise cancellation technology</div>
                  <div className="sd-benefit"><div className="sd-benefit-icon"><i className="fas fa-check"></i></div>Discreet, modern designs for all lifestyles</div>
                </div>
                <a className="btn-gold" onClick={() => showPage('contact')} style={{ width: 'fit-content', marginTop: '8px' }}>
                  <i className="fas fa-calendar-check"></i> Book This Service
                </a>
              </div>
            </div>
          </div>

          <Footer showPage={showPage} scrollToSection={scrollToSection} />
        </div>
      </div>

      {/* ABOUT PAGE */}
      <div className={`page ${activePage === 'about' ? 'active' : ''}`} id="page-about">
        <div className="about-page">
          <div className="about-hero">
            <div className="hero-badge" data-aos="fade-down" style={{ margin: '0 auto 20px', width: 'fit-content' }}>
              <i className="fas fa-hospital" style={{ color: 'var(--gold)' }}></i> About Our Clinic
            </div>
            <h1 data-aos="fade-up">About Patna Speech &amp; Hearing Care Clinic</h1>
            <p data-aos="fade-up" data-aos-delay="100">A centre of excellence in audiological and speech therapy services — serving the people of Bihar with dedication.</p>
          </div>

          <div className="about-story">
            <div className="about-story-text" data-aos="fade-right">
              <div className="section-tag" style={{ marginBottom: '16px' }}>Our Story &amp; Mission</div>
              <h2>Dedicated to Transforming Lives Through Better Hearing &amp; Speech</h2>
              <p>Patna Speech and Hearing Care Clinic is a leading facility in Bihar offering expert services in Hearing Aids, Speech Therapy, Audiometry Tests, and Digital Rechargeable Hearing Aids. Our team of experienced audiologists and speech therapists provide personalized care and comprehensive solutions for patients with hearing and speech impairments.</p>
              <p>We believe every person deserves to experience the world in its full richness — every word, every laugh, every conversation. That belief drives everything we do: from the technology we invest in, to the way we treat each patient with individual attention and dignity.</p>
              <p>Located in the heart of Patna, we serve patients from across Bihar and neighbouring states, earning a perfect 5.0 ⭐ Google rating from our grateful patients.</p>
              <a className="btn-gold" onClick={() => showPage('contact')} style={{ width: 'fit-content', marginTop: '8px' }}>
                <i className="fas fa-calendar-check"></i> Book a Consultation
              </a>
            </div>
            <div className="about-story-visual" data-aos="fade-left">
              <div className="about-stat-grid">
                <div className="about-stat">
                  <div className="about-stat-num">5.0⭐</div>
                  <div className="about-stat-label">Google Rating</div>
                </div>
                <div className="about-stat">
                  <div className="about-stat-num">41+</div>
                  <div className="about-stat-label">Patients Served</div>
                </div>
                <div className="about-stat">
                  <div className="about-stat-num">4+</div>
                  <div className="about-stat-label">Expert Services</div>
                </div>
                <div className="about-stat">
                  <div className="about-stat-num">7</div>
                  <div className="about-stat-label">Days Open/Week</div>
                </div>
              </div>
            </div>
          </div>

          {/* Team Section */}
          <section className="team-section">
            <div className="section-tag" data-aos="fade-up">Medical Leadership</div>
            <h2 className="section-title" data-aos="fade-up" data-aos-delay="50">Our Chief Specialist</h2>
            <p className="section-sub" data-aos="fade-up" data-aos-delay="100">Led by highly qualified clinical experts dedicated to restoring your hearing and speech health.</p>
            
            <div className="team-placeholder" data-aos="fade-up" data-aos-delay="150" style={{ justifyContent: 'center' }}>
              <div className="team-card" style={{ width: '320px', padding: '0', overflow: 'hidden' }}>
                <div style={{ height: '320px', width: '100%', overflow: 'hidden' }}>
                  <img 
                    src={doctorImageBase64} 
                    alt="Dr. Naveen Kumar" 
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} 
                  />
                </div>
                <div style={{ padding: '24px' }}>
                  <div className="team-name" style={{ fontSize: '22px' }}>Naveen Kumar</div>
                  <div className="team-role" style={{ color: 'var(--gold-light)', fontWeight: '700', marginBottom: '16px', letterSpacing: '1px', textTransform: 'uppercase', fontSize: '14px' }}>
                    Director
                  </div>
                  <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', lineHeight: '1.6' }}>
                    <p style={{ marginBottom: '4px', fontWeight: '600' }}>Audiologist & Speech Therapist</p>
                    <p style={{ opacity: 0.9 }}>DHLS (MUMBAI), B.ASLP (P.P.U)</p>
                    <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--gold-light)', opacity: 0.8 }}>RCI Reg. No: A120698</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <Footer showPage={showPage} scrollToSection={scrollToSection} />
        </div>
      </div>

      {/* CONTACT PAGE */}
      <div className={`page ${activePage === 'contact' ? 'active' : ''}`} id="page-contact">
        <div className="contact-page">
          <div className="contact-hero">
            <div className="hero-badge" data-aos="fade-down" style={{ margin: '0 auto 20px', width: 'fit-content' }}>
              <i className="fas fa-calendar-check" style={{ color: 'var(--gold)' }}></i> Book Appointment
            </div>
            <h1 data-aos="fade-up">Get In Touch</h1>
            <p data-aos="fade-up" data-aos-delay="100">Book a consultation with our expert audiologists or reach out for any queries. We're here to help.</p>
          </div>

          <div className="contact-body">
            <div data-aos="fade-right">
              <div className="contact-form-card">
                <h3>Book an Appointment</h3>
                <p className="sub">Fill in your details and we'll get back to you shortly to confirm your appointment.</p>

                {!formSubmitted ? (
                  <form onSubmit={handleSubmit} id="formContent">
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Full Name *</label>
                        <input name="fullName" type="text" className="form-input" placeholder="Your full name" required disabled={isSubmitting} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Phone Number *</label>
                        <input name="phoneNumber" type="tel" className="form-input" placeholder="10-digit mobile number" required disabled={isSubmitting} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Select Service *</label>
                      <select name="service" className="form-select" required disabled={isSubmitting}>
                        <option value="">— Choose a service —</option>
                        <option>Hearing Aid</option>
                        <option>Speech Therapy</option>
                        <option>Audiometry Test</option>
                        <option>Digital Rechargeable Hearing Aid</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Preferred Date *</label>
                      <input name="preferredDate" type="date" className="form-input" required min={new Date().toISOString().split('T')[0]} disabled={isSubmitting} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Message / Additional Info</label>
                      <textarea name="message" className="form-textarea" placeholder="Tell us briefly about your concern..." disabled={isSubmitting}></textarea>
                    </div>
                    <button type="submit" className="btn-submit" disabled={isSubmitting}>
                      {isSubmitting ? (
                        <>
                          <i className="fas fa-spinner fa-spin"></i> Submitting...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-paper-plane"></i> Submit Appointment Request
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  <div className="form-success" id="formSuccess" style={{ display: 'block' }}>
                    <i className="fas fa-circle-check"></i>
                    <h4>Appointment Request Sent!</h4>
                    <p>Thank you! We'll call you on your number to confirm your appointment soon.</p>
                    <button onClick={() => setFormSubmitted(false)} className="btn-outline" style={{ color: 'var(--blue)', borderColor: 'var(--blue)', marginTop: '20px' }}>Send another request</button>
                  </div>
                )}
              </div>
            </div>

            <div className="contact-info-col" data-aos="fade-left">
              <div className="info-card">
                <div className="info-card-header">
                  <div className="info-card-icon"><i className="fas fa-location-dot"></i></div>
                  <div className="info-card-title">Our Address</div>
                </div>
                <div className="info-card-content">
                  Shop No. 3, Shri Sanand Complex, Bari Path, Naya Tola, Lalbagh, <strong>Patna, Bihar 800004</strong>
                </div>
              </div>
              <div className="info-card">
                <div className="info-card-header">
                  <div className="info-card-icon"><i className="fas fa-phone-volume"></i></div>
                  <div className="info-card-title">Call Us</div>
                </div>
                <div className="info-card-content">
                  <a href="tel:+917295962124">📞 07295962124</a><br />
                  Available during clinic hours.<br />
                  WhatsApp: <a href="https://wa.me/917295962124">07295962124</a>
                </div>
              </div>
              
              <div className="info-card">
                <div className="info-card-header">
                  <div className="info-card-icon"><i className="fas fa-share-nodes"></i></div>
                  <div className="info-card-title">Follow Us</div>
                </div>
                <div className="info-card-content">
                  <div className="flex gap-4 mt-2">
                    <a href="https://www.facebook.com/naveen.kumar.966857" target="_blank" rel="noreferrer" className="w-10 h-10 bg-slate-100 flex items-center justify-center rounded-lg text-[#1a3c6e] hover:bg-[#1a3c6e] hover:text-white transition-colors cursor-pointer">
                      <i className="fab fa-facebook-f"></i>
                    </a>
                    <a href="https://www.instagram.com/patnaspeechandhearingclinic" target="_blank" rel="noreferrer" className="w-10 h-10 bg-slate-100 flex items-center justify-center rounded-lg text-[#1a3c6e] hover:bg-[#1a3c6e] hover:text-white transition-colors cursor-pointer">
                      <i className="fab fa-instagram"></i>
                    </a>
                  </div>
                </div>
              </div>

              <div className="map-card">
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3597.4326574164506!2d85.141311!3d25.611096!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39ed59648939c099%3A0xb8021876e574efc5!2sPatna%20Speech%20and%20Hearing%20Care%20Clinic!5e0!3m2!1sen!2sin!4v1714390000000!5m2!1sen!2sin"
                  allowFullScreen={true} 
                  loading="lazy" 
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Patna Speech and Hearing Care Clinic Location"
                  className="w-full min-h-[400px] border-0">
                </iframe>
              </div>
            </div>
          </div>

          <Footer showPage={showPage} scrollToSection={scrollToSection} />
        </div>
      </div>

      {/* FLOATING BUTTONS */}
      <a href="https://wa.me/917295962124" className="float-wa" target="_blank" rel="noreferrer">
        <i className="fab fa-whatsapp"></i>
      </a>
      <a href="tel:+917295962124" className="float-call">
        <i className="fas fa-phone"></i>
        <span>Call Now</span>
      </a>
    </>
  );
}

function Footer({ showPage, scrollToSection }: { showPage: (id: string) => void, scrollToSection: (id: string) => void }) {
  return (
    <footer>
      <div className="footer-grid">
        <div className="footer-brand">
          <div className="logo" onClick={() => showPage('home')} style={{ marginBottom: '18px' }}>
            <div className="logo-icon">P</div>
            <div className="logo-text">
              <div className="logo-title">PSHCC</div>
              <div className="logo-tag">Speech &amp; Hearing Care</div>
            </div>
          </div>
          <p className="footer-desc">Bihar's most trusted speech and hearing care clinic. Expert audiologists and speech therapists providing personalized care since inception.</p>
          <div className="footer-socials">
            <a href="https://www.facebook.com/naveen.kumar.966857" className="social-btn" target="_blank" rel="noreferrer"><i className="fab fa-facebook-f"></i></a>
            <a href="https://www.instagram.com/patnaspeechandhearingclinic" className="social-btn" target="_blank" rel="noreferrer"><i className="fab fa-instagram"></i></a>
            <a href="https://wa.me/917295962124" className="social-btn" target="_blank" rel="noreferrer"><i className="fab fa-whatsapp"></i></a>
          </div>
        </div>
        <div>
          <div className="footer-col-title">Quick Links</div>
          <div className="footer-links">
            <span className="footer-link" onClick={() => showPage('home')}><i className="fas fa-chevron-right"></i> Home</span>
            <span className="footer-link" onClick={() => showPage('services')}><i className="fas fa-chevron-right"></i> Services</span>
            <span className="footer-link" onClick={() => showPage('about')}><i className="fas fa-chevron-right"></i> About Us</span>
            <span className="footer-link" onClick={() => scrollToSection('reviews-section')}><i className="fas fa-chevron-right"></i> Patient Reviews</span>
            <span className="footer-link" onClick={() => showPage('contact')}><i className="fas fa-chevron-right"></i> Contact Us</span>
          </div>
        </div>
        <div>
          <div className="footer-col-title">Our Services</div>
          <div className="footer-links">
            <span className="footer-link" onClick={() => showPage('services')}><i className="fas fa-chevron-right"></i> Hearing Aids</span>
            <span className="footer-link" onClick={() => showPage('services')}><i className="fas fa-chevron-right"></i> Speech Therapy</span>
            <span className="footer-link" onClick={() => showPage('services')}><i className="fas fa-chevron-right"></i> Audiometry Test</span>
          </div>
        </div>
        <div>
          <div className="footer-col-title">Contact Info</div>
          <div className="footer-contact-item">
            <div className="footer-contact-icon"><i className="fas fa-location-dot"></i></div>
            <div className="footer-contact-text"><strong>Address</strong>Shop No. 3, Shri Sanand Complex, Bari Path, Naya Tola, Patna 800004</div>
          </div>
          <div className="footer-contact-item">
            <div className="footer-contact-icon"><i className="fas fa-phone"></i></div>
            <div className="footer-contact-text"><strong>Phone</strong>07295962124</div>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <div className="footer-copy">© 2024 Patna Speech and Hearing Care Clinic. All Rights Reserved.</div>
      </div>
    </footer>
  );
}
