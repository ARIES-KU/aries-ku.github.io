// schema.org description of the center for search engines and AI assistants (JSON-LD, rendered on the home pages).
// It only restates what the site already shows. People appear here only if they have consented (the director today),
// and their profile links come from people.json, so the card and this block cannot drift apart.
import people from '../data/people.json';

export function centerJsonLd(site: URL) {
  const director = people.faculty.find((f) => f.initials === 'SS' && f.consent);
  const u = (path: string) => new URL(path, site).href;

  return {
    '@context': 'https://schema.org',
    '@type': 'ResearchOrganization',
    '@id': u('/#organization'),
    name: 'ARIES Center',
    alternateName: [
      'ARIES',
      'Center of Excellence for Advanced Resilience and Intelligent Engineering of Structural Systems',
      'ศูนย์เชี่ยวชาญเฉพาะทางวิศวกรรมระบบโครงสร้างอัจฉริยะเพื่อความยั่งยืน',
      'ศวอ.',
    ],
    description:
      'Department-level center of excellence at Kasetsart University that develops AI, digital-twin and field-sensing technologies for assessing and maintaining bridges and infrastructure.',
    url: u('/'),
    logo: u('/images/logo.png'),
    foundingDate: '2026',
    email: 'supasit.sriv@ku.ac.th',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Room 9806, 8th floor, Building 9, Faculty of Engineering, Kasetsart University, 50 Ngam Wong Wan Road',
      addressLocality: 'Lat Yao, Chatuchak',
      addressRegion: 'Bangkok',
      postalCode: '10900',
      addressCountry: 'TH',
    },
    parentOrganization: {
      '@type': 'Organization',
      name: 'Department of Civil Engineering, Faculty of Engineering, Kasetsart University',
      parentOrganization: {
        '@type': 'CollegeOrUniversity',
        name: 'Kasetsart University',
        url: 'https://www.ku.ac.th/',
      },
    },
    knowsAbout: [
      'Bridge inspection',
      'Structural health monitoring',
      'Digital twins',
      'UAV inspection',
      'LiDAR',
      'Structural reliability',
      'Corrosion of reinforced and prestressed concrete',
      'Infrastructure asset management',
    ],
    ...(director && {
      founder: {
        '@type': 'Person',
        name: 'Supasit Srivaranun',
        alternateName: 'ศุภศิษฏ์ ศรีวรานันท์',
        honorificPrefix: 'Asst. Prof. Dr.',
        jobTitle: 'Director, ARIES Center',
        sameAs: director.links.map((l) => l.href).filter((h) => h.startsWith('http')),
      },
    }),
  };
}
