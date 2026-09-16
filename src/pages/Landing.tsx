import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CalendarPlus, Smile, ShieldCheck, Clock, Phone, MapPin, Mail,
  Stethoscope, Sparkles, HeartPulse, Star
} from "lucide-react";

const services = [
  { name: "Orthodontics (Braces)", icon: Smile },
  { name: "EXO (Bunot)", icon: Stethoscope },
  { name: "Restoration", icon: Sparkles },
  { name: "Oral Prophylaxis", icon: ShieldCheck },
  { name: "Veneers", icon: Sparkles },
  { name: "Denture (Pustiso)", icon: Smile },
  { name: "Implant", icon: HeartPulse },
  { name: "Surgery", icon: Stethoscope },
  { name: "TMJ", icon: HeartPulse },
  { name: "Root Canal", icon: ShieldCheck },
  { name: "Teeth Whitening", icon: Sparkles },
  { name: "Fixed Bridge", icon: Smile },
];

const features = [
  { icon: CalendarPlus, title: "Easy Online Booking", desc: "Reserve your appointment slot in just a few clicks." },
  { icon: ShieldCheck, title: "Trusted Care", desc: "Experienced dental professionals committed to your smile." },
  { icon: Clock, title: "Flexible Hours", desc: "Convenient schedules that work around your day." },
];

const testimonials = [
  { name: "Maria S.", text: "The booking process was so easy and the staff were incredibly kind!", rating: 5 },
  { name: "John R.", text: "Painless treatment and a beautiful clinic. Highly recommended.", rating: 5 },
  { name: "Anna L.", text: "Professional team. My teeth have never felt better.", rating: 5 },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-40 backdrop-blur bg-background/80 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="/clinic-logo.png" alt="Ayag Dental Clinic" className="w-9 h-9 rounded-xl object-contain" />
            <span className="font-heading font-bold text-lg text-foreground">Ayag Dental</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#services" className="hover:text-foreground transition-colors">Services</a>
            <a href="#about" className="hover:text-foreground transition-colors">About</a>
            <a href="#testimonials" className="hover:text-foreground transition-colors">Reviews</a>
            <a href="#contact" className="hover:text-foreground transition-colors">Contact</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link to="/register">
              <Button size="sm" className="gradient-primary text-primary-foreground">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-primary opacity-10" />
        <div className="max-w-7xl mx-auto px-4 py-20 md:py-28 grid md:grid-cols-2 gap-12 items-center relative">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
              <Sparkles className="w-3 h-3" /> Trusted Dental Care
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold font-heading text-foreground leading-tight">
              Your Healthy Smile <span className="text-primary">Starts Here</span>
            </h1>
            <p className="mt-5 text-lg text-muted-foreground max-w-lg">
              Modern dental care at Ayag Dental Clinic. Book appointments online, manage your records, and enjoy a brighter smile.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register">
                <Button size="lg" className="gradient-primary text-primary-foreground">
                  <CalendarPlus className="w-4 h-4 mr-2" /> Book an Appointment
                </Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="outline">Sign In</Button>
              </Link>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            <div className="aspect-square rounded-3xl gradient-primary shadow-elevated flex items-center justify-center">
              <img src="/clinic-logo.png" alt="Ayag Dental Clinic" className="w-2/3 h-2/3 object-contain drop-shadow-2xl" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 grid md:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
              <Card className="shadow-card h-full">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center mb-4">
                    <f.icon className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <h3 className="font-heading font-semibold text-lg text-foreground mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground">{f.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Services */}
      <section id="services" className="py-20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold font-heading text-foreground">Our Services</h2>
            <p className="mt-3 text-muted-foreground">Comprehensive dental care for the whole family.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {services.map((s, i) => (
              <motion.div key={s.name} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.04 }}>
                <Card className="shadow-card hover:shadow-elevated transition-shadow h-full">
                  <CardContent className="p-5 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <s.icon className="w-5 h-5 text-primary" />
                    </div>
                    <span className="font-medium text-foreground text-sm">{s.name}</span>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="py-20 bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold font-heading text-foreground">About Ayag Dental Clinic</h2>
          <p className="mt-5 text-muted-foreground text-lg leading-relaxed">
            At Ayag Dental Clinic, we combine modern technology with compassionate care to deliver
            exceptional dental services. From routine check-ups to advanced procedures, our dedicated
            team is committed to helping you achieve and maintain a healthy, confident smile.
          </p>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold font-heading text-foreground">What Our Patients Say</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <motion.div key={t.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
                <Card className="shadow-card h-full">
                  <CardContent className="p-6">
                    <div className="flex gap-1 mb-3">
                      {Array.from({ length: t.rating }).map((_, j) => (
                        <Star key={j} className="w-4 h-4 fill-warning text-warning" />
                      ))}
                    </div>
                    <p className="text-foreground mb-4">"{t.text}"</p>
                    <p className="text-sm font-medium text-muted-foreground">— {t.name}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4">
          <Card className="shadow-elevated overflow-hidden">
            <div className="gradient-primary p-10 md:p-14 text-center">
              <h2 className="text-3xl md:text-4xl font-bold font-heading text-primary-foreground">Ready for a Brighter Smile?</h2>
              <p className="mt-3 text-primary-foreground/90">Create your account and book your first appointment today.</p>
              <div className="mt-6 flex flex-wrap gap-3 justify-center">
                <Link to="/register">
                  <Button size="lg" variant="secondary">Create Account</Button>
                </Link>
                <Link to="/login">
                  <Button size="lg" variant="outline" className="bg-transparent text-primary-foreground border-primary-foreground/40 hover:bg-primary-foreground/10 hover:text-primary-foreground">
                    Sign In
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Contact / Footer */}
      <footer id="contact" className="bg-sidebar text-sidebar-foreground">
        <div className="max-w-7xl mx-auto px-4 py-12 grid md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <img src="/clinic-logo.png" alt="Ayag Dental Clinic" className="w-9 h-9 rounded-xl object-contain" />
              <span className="font-heading font-bold text-lg">Ayag Dental</span>
            </div>
            <p className="text-sm text-sidebar-foreground/70">
              Caring for smiles with compassion and expertise.
            </p>
          </div>
          <div>
            <h4 className="font-heading font-semibold mb-3">Contact</h4>
            <ul className="space-y-2 text-sm text-sidebar-foreground/70">
              <li className="flex items-center gap-2"><Phone className="w-4 h-4" /> (123) 456-7890</li>
              <li className="flex items-center gap-2"><Mail className="w-4 h-4" /> info@ayagdental.com</li>
              <li className="flex items-center gap-2"><MapPin className="w-4 h-4" /> Ayag, Philippines</li>
            </ul>
          </div>
          <div>
            <h4 className="font-heading font-semibold mb-3">Hours</h4>
            <ul className="space-y-1 text-sm text-sidebar-foreground/70">
              <li>Mon – Fri: 9:00 AM – 6:00 PM</li>
              <li>Saturday: 9:00 AM – 4:00 PM</li>
              <li>Sunday: Closed</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-sidebar-border">
          <div className="max-w-7xl mx-auto px-4 py-4 text-xs text-sidebar-foreground/50 text-center">
            © {new Date().getFullYear()} Ayag Dental Clinic. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
